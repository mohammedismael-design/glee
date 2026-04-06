import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class InventoryCleanupJob {
  private readonly logger = new Logger(InventoryCleanupJob.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Release expired inventory holds every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async releaseExpiredHolds() {
    const expired = await this.prisma.inventoryHold.findMany({
      where: { expiresAt: { lt: new Date() }, isReleased: false },
    });

    if (expired.length === 0) return;
    this.logger.log(`Releasing ${expired.length} expired inventory holds`);

    for (const hold of expired) {
      if (hold.ticketTierId) {
        await this.prisma.ticketTier.update({
          where: { id: hold.ticketTierId },
          data: { heldQuantity: { decrement: hold.quantity } },
        });
      }
      await this.prisma.inventoryHold.update({
        where: { id: hold.id },
        data: { isReleased: true },
      });
    }
  }

  /**
   * Release expired time-slot locks every 2 minutes.
   */
  @Cron('*/2 * * * *')
  async releaseExpiredTableLocks() {
    const result = await this.prisma.timeSlotTable.updateMany({
      where: { lockedUntil: { lt: new Date() }, isAvailable: false },
      data: { isAvailable: true, lockedUntil: null, lockedBy: null },
    });
    if (result.count > 0) {
      this.logger.log(`Released ${result.count} expired table locks`);
    }
  }

  /**
   * Cancel unpaid bookings pending for more than 30 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelStaleBookings() {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const stale = await this.prisma.booking.findMany({
      where: {
        status: 'AWAITING_PAYMENT',
        createdAt: { lt: cutoff },
      },
    });

    for (const booking of stale) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      this.eventEmitter.emit('booking.cancelled', { bookingId: booking.id, userId: booking.userId, reason: 'payment_timeout' });
    }

    if (stale.length > 0) {
      this.logger.log(`Auto-cancelled ${stale.length} unpaid bookings`);
    }
  }

  /**
   * Publish scheduled menu items whose publish date has arrived.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async publishScheduledItems() {
    const now = new Date();
    const result = await this.prisma.menuItem.updateMany({
      where: {
        status: 'PENDING',
        scheduledPublishAt: { lte: now },
      },
      data: { status: 'LIVE' },
    });
    if (result.count > 0) {
      this.logger.log(`Published ${result.count} scheduled menu items`);
    }
  }

  /**
   * Clean up expired idempotency keys daily.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupIdempotencyKeys() {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    this.logger.log(`Cleaned up ${result.count} expired idempotency keys`);
  }

  /**
   * GDPR: Permanently delete users who requested deletion 30+ days ago.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async gdprUserCleanup() {
    const retentionDays = 30;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.user.deleteMany({
      where: { deletionRequestAt: { lt: cutoff }, deletedAt: { not: null } },
    });
    if (result.count > 0) {
      this.logger.log(`GDPR: permanently deleted ${result.count} user records`);
    }
  }
}
