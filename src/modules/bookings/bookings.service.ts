import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {}

  /**
   * Atomically create a booking with time-slot locking.
   * Uses a transaction + row-level update to prevent double-booking.
   */
  async create(userId: string, dto: CreateBookingDto) {
    return this.prisma.$transaction(async (tx) => {
      // Idempotency: return existing booking for same key
      const existing = await tx.booking.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return existing;

      // Lock the TimeSlotTable row to prevent concurrent bookings
      const slotTable = await tx.timeSlotTable.findUnique({
        where: { timeSlotId_tableId: { timeSlotId: dto.timeSlotId, tableId: dto.tableId } },
      });

      if (slotTable) {
        if (!slotTable.isAvailable) throw new ConflictException('Table is not available for this time slot');
        if (slotTable.lockedUntil && slotTable.lockedUntil > new Date()) {
          throw new ConflictException('Table is temporarily locked — please try again shortly');
        }
        // Acquire lock for 10 minutes
        const lockExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await tx.timeSlotTable.update({
          where: { id: slotTable.id },
          data: { isAvailable: false, lockedUntil: lockExpiry, lockedBy: userId },
        });
      } else {
        // Verify table and slot exist
        const [table, slot] = await Promise.all([
          tx.table.findUnique({ where: { id: dto.tableId } }),
          tx.timeSlot.findUnique({ where: { id: dto.timeSlotId } }),
        ]);
        if (!table) throw new NotFoundException('Table not found');
        if (!slot) throw new NotFoundException('Time slot not found');
        if (slot.isBlocked) throw new ConflictException('Time slot is blocked');

        // Check no other confirmed/pending booking for same table+slot
        const conflict = await tx.booking.findFirst({
          where: {
            tableId: dto.tableId,
            timeSlotId: dto.timeSlotId,
            status: { in: [BookingStatus.PENDING, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED] },
          },
        });
        if (conflict) throw new ConflictException('Table is already booked for this time slot');

        await tx.timeSlotTable.create({
          data: {
            timeSlotId: dto.timeSlotId,
            tableId: dto.tableId,
            isAvailable: false,
            lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
            lockedBy: userId,
          },
        });
      }

      // Calculate amounts
      const table = await tx.table.findUnique({ where: { id: dto.tableId } });
      const slot = await tx.timeSlot.findUnique({ where: { id: dto.timeSlotId }, include: { venue: true } });
      const minimumSpend = slot?.minimumSpend || table?.minimumSpend || null;
      const venue = slot?.venue;

      let depositAmount = null;
      if (venue?.depositRequired && venue?.depositPercent && minimumSpend) {
        depositAmount = (Number(minimumSpend) * Number(venue.depositPercent)) / 100;
      }

      // Build booking items
      let bookingItems: any[] = [];
      let itemsTotal = 0;
      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          const menuItem = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
          if (!menuItem) throw new NotFoundException(`One or more menu items could not be found`);
          bookingItems.push({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: menuItem.price,
          });
          itemsTotal += Number(menuItem.price) * item.quantity;
        }
      }

      const booking = await tx.booking.create({
        data: {
          userId,
          tableId: dto.tableId,
          timeSlotId: dto.timeSlotId,
          reservationType: dto.reservationType,
          guestCount: dto.guestCount,
          customerNotes: dto.customerNotes,
          preferences: dto.preferences,
          minimumSpend,
          depositAmount,
          totalAmount: itemsTotal > 0 ? itemsTotal : null,
          idempotencyKey: dto.idempotencyKey,
          status: BookingStatus.PENDING,
          bookingItems: bookingItems.length > 0 ? { create: bookingItems } : undefined,
        },
        include: { bookingItems: true, table: true, timeSlot: true },
      });

      this.eventEmitter.emit('booking.created', { bookingId: booking.id, userId });
      return booking;
    });
  }

  async findById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { table: true, timeSlot: { include: { venue: true } }, bookingItems: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async listByUser(userId: string, page = 1, limit = 20) {
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { table: true, timeSlot: true },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async listByVenue(venueId: string, page = 1, limit = 50, status?: BookingStatus) {
    const where: any = { timeSlot: { venueId } };
    if (status) where.status = status;
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { table: true, timeSlot: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async updateStatus(id: string, status: BookingStatus, actorId: string, reason?: string, isOverride = false) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    const validTransitions: Record<BookingStatus, BookingStatus[]> = {
      PENDING: [BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.DECLINED, BookingStatus.CANCELLED],
      AWAITING_PAYMENT: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.DECLINED],
      CONFIRMED: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
      DECLINED: [],
      CANCELLED: [],
      COMPLETED: [],
      NO_SHOW: [],
    };

    if (!isOverride && !validTransitions[booking.status].includes(status)) {
      throw new BadRequestException(`Cannot transition from ${booking.status} to ${status}`);
    }

    const data: any = { status };
    if (reason) data.declineReason = reason;
    if (status === BookingStatus.CONFIRMED) data.confirmedAt = new Date();
    if (status === BookingStatus.CANCELLED) data.cancelledAt = new Date();
    if (status === BookingStatus.COMPLETED) data.completedAt = new Date();
    if (isOverride) {
      data.overriddenById = actorId;
      data.overriddenAt = new Date();
    }

    // Release slot lock when confirmed/declined/cancelled
    if ([BookingStatus.CONFIRMED, BookingStatus.DECLINED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW].includes(status)) {
      if (status === BookingStatus.CONFIRMED) {
        await this.prisma.timeSlotTable.updateMany({
          where: { timeSlotId: booking.timeSlotId, tableId: booking.tableId },
          data: { isAvailable: false, lockedUntil: null, lockedBy: null },
        });
      } else {
        await this.prisma.timeSlotTable.updateMany({
          where: { timeSlotId: booking.timeSlotId, tableId: booking.tableId },
          data: { isAvailable: true, lockedUntil: null, lockedBy: null },
        });
      }
    }

    const updated = await this.prisma.booking.update({ where: { id }, data });

    await this.auditService.log({
      actorId,
      action: isOverride ? 'BOOKING_OVERRIDE' : 'UPDATE',
      entityType: 'Booking',
      entityId: id,
      before: { status: booking.status },
      after: { status },
      metadata: { reason },
    });

    this.eventEmitter.emit(`booking.${status.toLowerCase()}`, { bookingId: id, userId: booking.userId, actorId });
    return updated;
  }

  async cancel(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) throw new ForbiddenException('Not your booking');
    if (![BookingStatus.PENDING, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED].includes(booking.status)) {
      throw new BadRequestException('Booking cannot be cancelled in its current state');
    }
    return this.updateStatus(id, BookingStatus.CANCELLED, userId);
  }
}
