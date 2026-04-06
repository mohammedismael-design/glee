import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class VendorsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async register(userId: string, businessName: string, contactEmail: string) {
    const existing = await this.prisma.vendor.findUnique({ where: { userId } });
    if (existing) return existing;

    const vendor = await this.prisma.vendor.create({
      data: { userId, businessName, contactEmail },
    });
    await this.auditService.log({ actorId: userId, action: 'CREATE', entityType: 'Vendor', entityId: vendor.id });
    return vendor;
  }

  async getProfile(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      include: { venues: true, events: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }

  async getSalesReport(vendorId: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const [bookings, ticketSales] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          timeSlot: { venue: { vendorId } },
          status: 'COMPLETED',
          ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        },
        include: { table: true, bookingItems: true },
      }),
      this.prisma.ticketPurchase.findMany({
        where: {
          ticketTier: { event: { vendorId } },
          paymentStatus: 'SUCCEEDED',
          ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        },
      }),
    ]);

    const bookingRevenue = bookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
    const ticketRevenue = ticketSales.reduce((sum, t) => sum + Number(t.totalAmount), 0);

    return {
      totalBookings: bookings.length,
      bookingRevenue,
      totalTicketSales: ticketSales.length,
      ticketRevenue,
      totalRevenue: bookingRevenue + ticketRevenue,
      bookings,
      ticketSales,
    };
  }

  async blockDates(venueId: string, dates: string[], vendorId: string) {
    // Create blocked time slots for each date (full day)
    const created = await Promise.all(
      dates.map((date) =>
        this.prisma.timeSlot.create({
          data: {
            venueId,
            startTime: new Date(`${date}T00:00:00Z`),
            endTime: new Date(`${date}T23:59:59Z`),
            label: 'Blocked',
            isBlocked: true,
          },
        }),
      ),
    );
    return created;
  }

  async getDashboard(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const [events, bookingCount, upcomingBookings] = await Promise.all([
      this.prisma.event.count({ where: { vendorId: vendor.id } }),
      this.prisma.booking.count({ where: { timeSlot: { venue: { vendorId: vendor.id } } } }),
      this.prisma.booking.findMany({
        where: {
          timeSlot: { venue: { vendorId: vendor.id } },
          status: { in: ['PENDING', 'CONFIRMED'] },
          timeSlot: { startTime: { gte: new Date() } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { table: true, timeSlot: true, user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    return { events, bookingCount, upcomingBookings, vendor };
  }
}
