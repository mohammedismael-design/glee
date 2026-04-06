import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationListeners {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('booking.created')
  async onBookingCreated({ bookingId }: { bookingId: string }) {
    await this.notificationsService.sendBookingStatusUpdate(bookingId, 'PENDING');
  }

  @OnEvent('booking.confirmed')
  async onBookingConfirmed({ bookingId }: { bookingId: string }) {
    await this.notificationsService.sendBookingConfirmation(bookingId);
  }

  @OnEvent('booking.declined')
  async onBookingDeclined({ bookingId }: { bookingId: string }) {
    await this.notificationsService.sendBookingStatusUpdate(bookingId, 'DECLINED');
  }

  @OnEvent('booking.cancelled')
  async onBookingCancelled({ bookingId }: { bookingId: string }) {
    await this.notificationsService.sendBookingStatusUpdate(bookingId, 'CANCELLED');
  }

  @OnEvent('booking.awaiting_payment')
  async onBookingAwaitingPayment({ bookingId }: { bookingId: string }) {
    await this.notificationsService.sendBookingStatusUpdate(bookingId, 'AWAITING_PAYMENT');
  }

  @OnEvent('booking.no_show')
  async onBookingNoShow({ bookingId }: { bookingId: string }) {
    await this.notificationsService.sendBookingStatusUpdate(bookingId, 'NO_SHOW');
  }

  @OnEvent('ticket.confirmed')
  async onTicketConfirmed({ ticketPurchaseId }: { ticketPurchaseId: string }) {
    await this.notificationsService.sendTicketConfirmation(ticketPurchaseId);
  }
}
