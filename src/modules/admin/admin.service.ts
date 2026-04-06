import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublishStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async getPendingEvents(page = 1, limit = 20) {
    const where = { status: PublishStatus.PENDING };
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: { vendor: { select: { businessName: true } }, venue: { select: { name: true } } },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getPendingMenuItems(page = 1, limit = 20) {
    const where = { status: PublishStatus.PENDING };
    const [data, total] = await Promise.all([
      this.prisma.menuItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { category: { include: { venue: { select: { name: true } } } } },
      }),
      this.prisma.menuItem.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getPendingVenues(page = 1, limit = 20) {
    const where = { status: PublishStatus.PENDING };
    const [data, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { vendor: { select: { businessName: true, userId: true } } },
      }),
      this.prisma.venue.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getPendingVendors() {
    return this.prisma.vendor.findMany({
      where: { isApproved: false },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } } },
    });
  }

  async approveVendor(vendorId: string, actorId: string) {
    const vendor = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { isApproved: true, approvedAt: new Date(), approvedById: actorId },
    });
    await this.auditService.log({ actorId, action: 'APPROVE', entityType: 'Vendor', entityId: vendorId });
    return vendor;
  }

  async getAuditLogs(entityType?: string, entityId?: string, page = 1, limit = 50) {
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getDashboardMetrics() {
    const [
      totalUsers, totalVenues, totalEvents, totalBookings,
      pendingEvents, pendingVendors,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.venue.count(),
      this.prisma.event.count(),
      this.prisma.booking.count(),
      this.prisma.event.count({ where: { status: 'PENDING' } }),
      this.prisma.vendor.count({ where: { isApproved: false } }),
    ]);
    return { totalUsers, totalVenues, totalEvents, totalBookings, pendingEvents, pendingVendors };
  }
}
