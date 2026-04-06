import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishStatus } from '@prisma/client';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateTicketTierDto } from './dto/create-ticket-tier.dto';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import * as slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  async list(page = 1, limit = 20, filters: any = {}) {
    const where: any = { status: PublishStatus.LIVE };
    if (filters.category) where.category = filters.category;
    if (filters.venueId) where.venueId = filters.venueId;
    if (filters.dateFrom) where.startTime = { gte: new Date(filters.dateFrom) };
    if (filters.dateTo) where.startTime = { ...where.startTime, lte: new Date(filters.dateTo) };

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startTime: 'asc' },
        include: {
          venue: { select: { id: true, name: true, city: true } },
          ticketTiers: { where: { isActive: true }, select: { id: true, name: true, price: true, totalQuantity: true, soldQuantity: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findBySlug(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        venue: true,
        ticketTiers: { where: { isActive: true } },
        vendor: { select: { businessName: true } },
      },
    });
    if (!event || event.status !== PublishStatus.LIVE) throw new NotFoundException('Event not found');
    return event;
  }

  async create(vendorId: string, dto: CreateEventDto, actorId: string) {
    const slug = await this.generateUniqueSlug(dto.title);
    const event = await this.prisma.event.create({
      data: {
        vendorId,
        venueId: dto.venueId,
        title: dto.title,
        slug,
        description: dto.description,
        category: dto.category,
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        status: PublishStatus.DRAFT,
      },
    });
    await this.auditService.log({ actorId, action: 'CREATE', entityType: 'Event', entityId: event.id, after: event });
    return event;
  }

  async update(id: string, dto: Partial<CreateEventDto>, actorId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const updated = await this.prisma.event.update({ where: { id }, data: { ...dto, updatedAt: new Date() } });
    await this.auditService.log({ actorId, action: 'UPDATE', entityType: 'Event', entityId: id, before: event, after: updated });
    return updated;
  }

  async submitForReview(id: string, actorId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status !== PublishStatus.DRAFT) throw new BadRequestException('Only draft events can be submitted');
    return this.prisma.event.update({ where: { id }, data: { status: PublishStatus.PENDING } });
  }

  async moderate(id: string, action: 'approve' | 'reject', moderatorId: string, note?: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    const status = action === 'approve' ? PublishStatus.LIVE : PublishStatus.REJECTED;
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status, moderationNote: note, moderatedById: moderatorId, moderatedAt: new Date() },
    });
    await this.auditService.log({ actorId: moderatorId, action: action === 'approve' ? 'APPROVE' : 'REJECT', entityType: 'Event', entityId: id });
    this.eventEmitter.emit('event.moderated', { eventId: id, status, moderatorId });
    return updated;
  }

  async addTicketTier(eventId: string, dto: CreateTicketTierDto, actorId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    return this.prisma.ticketTier.create({
      data: {
        eventId,
        name: dto.name,
        price: dto.price,
        totalQuantity: dto.totalQuantity,
        earlyBirdLimit: dto.earlyBirdLimit,
        earlyBirdPrice: dto.earlyBirdPrice,
        earlyBirdEndsAt: dto.earlyBirdEndsAt ? new Date(dto.earlyBirdEndsAt) : null,
        description: dto.description,
      },
    });
  }

  async holdInventory(ticketTierId: string, userId: string, quantity: number, idempotencyKey: string) {
    return this.prisma.$transaction(async (tx) => {
      const tier = await tx.ticketTier.findUnique({ where: { id: ticketTierId } });
      if (!tier || !tier.isActive) throw new NotFoundException('Ticket tier not found or inactive');

      const available = tier.totalQuantity - tier.soldQuantity - tier.heldQuantity;
      if (available < quantity) throw new ConflictException('Insufficient ticket availability');

      const holdTtlSeconds = this.configService.get<number>('redis.inventoryHoldTtlSeconds', 600);
      const expiresAt = new Date(Date.now() + holdTtlSeconds * 1000);

      await tx.ticketTier.update({
        where: { id: ticketTierId },
        data: { heldQuantity: { increment: quantity } },
      });

      const hold = await tx.inventoryHold.create({
        data: { ticketTierId, userId, quantity, expiresAt, idempotencyKey },
      });

      return { holdId: hold.id, expiresAt, quantity };
    });
  }

  async purchaseTicket(userId: string, dto: PurchaseTicketDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.ticketPurchase.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return existing;

      const tier = await tx.ticketTier.findUnique({ where: { id: dto.ticketTierId } });
      if (!tier || !tier.isActive) throw new NotFoundException('Ticket tier not found');

      const available = tier.totalQuantity - tier.soldQuantity - tier.heldQuantity;
      if (available < dto.quantity) throw new ConflictException('Insufficient ticket availability');

      const unitPrice = tier.earlyBirdPrice && tier.earlyBirdEndsAt && new Date() < tier.earlyBirdEndsAt
        ? tier.earlyBirdPrice
        : tier.price;
      const totalAmount = Number(unitPrice) * dto.quantity;

      const purchase = await tx.ticketPurchase.create({
        data: {
          userId,
          ticketTierId: dto.ticketTierId,
          quantity: dto.quantity,
          unitPrice,
          totalAmount,
          idempotencyKey: dto.idempotencyKey,
        },
      });

      await tx.ticketTier.update({
        where: { id: dto.ticketTierId },
        data: { heldQuantity: { increment: dto.quantity } },
      });

      this.eventEmitter.emit('ticket.purchased', { purchaseId: purchase.id, userId, amount: totalAmount });
      return purchase;
    });
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = (slugify as any)(title, { lower: true, strict: true });
    let slug = base;
    let counter = 0;
    while (await this.prisma.event.findUnique({ where: { slug } })) {
      counter++;
      slug = `${base}-${counter}`;
    }
    return slug;
  }
}
