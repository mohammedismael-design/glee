import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../audit/audit.service';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private auditService: AuditService,
  ) {
    this.stripe = new Stripe(this.configService.get<string>('payment.stripeSecretKey'), {
      apiVersion: '2023-10-16',
    });
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata: Record<string, string>,
    idempotencyKey: string,
  ) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: Math.round(amount * 100), // convert to pence/cents
        currency,
        metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey },
    );
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  }

  async createBookingPaymentIntent(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { timeSlot: { include: { venue: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const venue = booking.timeSlot?.venue;
    const amount = booking.depositAmount
      ? Number(booking.depositAmount)
      : Number(booking.totalAmount || booking.minimumSpend || 0);

    if (amount <= 0) throw new BadRequestException('No payable amount on booking');

    const idempotencyKey = `booking-pi-${bookingId}`;
    const currency = this.configService.get<string>('payment.currency', 'GBP').toLowerCase();

    const { clientSecret, paymentIntentId } = await this.createPaymentIntent(
      amount,
      currency,
      { bookingId, userId, type: 'booking' },
      idempotencyKey,
    );

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { paymentId: paymentIntentId, status: 'AWAITING_PAYMENT' },
    });

    await this.prisma.payment.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        bookingId,
        provider: 'STRIPE',
        externalId: paymentIntentId,
        amount,
        currency: currency.toUpperCase(),
        idempotencyKey,
      },
    });

    return { clientSecret, paymentIntentId, amount, currency };
  }

  async createTicketPaymentIntent(ticketPurchaseId: string, userId: string) {
    const purchase = await this.prisma.ticketPurchase.findUnique({ where: { id: ticketPurchaseId } });
    if (!purchase) throw new NotFoundException('Ticket purchase not found');

    const idempotencyKey = `ticket-pi-${ticketPurchaseId}`;
    const currency = this.configService.get<string>('payment.currency', 'GBP').toLowerCase();
    const amount = Number(purchase.totalAmount);

    const { clientSecret, paymentIntentId } = await this.createPaymentIntent(
      amount,
      currency,
      { ticketPurchaseId, userId, type: 'ticket' },
      idempotencyKey,
    );

    await this.prisma.ticketPurchase.update({
      where: { id: ticketPurchaseId },
      data: { paymentId: paymentIntentId },
    });

    await this.prisma.payment.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        ticketPurchaseId,
        provider: 'STRIPE',
        externalId: paymentIntentId,
        amount,
        currency: currency.toUpperCase(),
        idempotencyKey,
      },
    });

    return { clientSecret, paymentIntentId, amount, currency };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.configService.get<string>('payment.stripeWebhookSecret');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    // Idempotency: skip already processed events
    const existing = await this.prisma.webhookEvent.findUnique({ where: { externalId: event.id } });
    if (existing?.processed) {
      this.logger.log(`Webhook ${event.id} already processed`);
      return { received: true };
    }

    const record = await this.prisma.webhookEvent.upsert({
      where: { externalId: event.id },
      update: {},
      create: {
        provider: 'stripe',
        eventType: event.type,
        externalId: event.id,
        payload: event as any,
      },
    });

    try {
      await this.processStripeEvent(event);
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: { processed: true, processedAt: new Date() },
      });
    } catch (err) {
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: { error: err.message },
      });
      throw err;
    }

    return { received: true };
  }

  private async processStripeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.onPaymentSucceeded(intent);
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.onPaymentFailed(intent);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await this.onChargeRefunded(charge);
        break;
      }
      default:
        this.logger.log(`Unhandled Stripe event: ${event.type}`);
    }
  }

  private async onPaymentSucceeded(intent: Stripe.PaymentIntent) {
    await this.prisma.payment.updateMany({
      where: { externalId: intent.id },
      data: { status: 'SUCCEEDED', webhookVerified: true },
    });

    const { bookingId, ticketPurchaseId } = intent.metadata;

    if (bookingId) {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { paymentStatus: 'SUCCEEDED', status: 'CONFIRMED', confirmedAt: new Date() },
      });
      await this.prisma.timeSlotTable.updateMany({
        where: { lockedBy: { not: null } },
        data: { lockedUntil: null, lockedBy: null },
      });
      this.eventEmitter.emit('booking.confirmed', { bookingId });
    }

    if (ticketPurchaseId) {
      const purchase = await this.prisma.ticketPurchase.update({
        where: { id: ticketPurchaseId },
        data: { paymentStatus: 'SUCCEEDED' },
      });
      await this.prisma.ticketTier.update({
        where: { id: purchase.ticketTierId },
        data: {
          soldQuantity: { increment: purchase.quantity },
          heldQuantity: { decrement: purchase.quantity },
        },
      });
      this.eventEmitter.emit('ticket.confirmed', { ticketPurchaseId });
    }
  }

  private async onPaymentFailed(intent: Stripe.PaymentIntent) {
    await this.prisma.payment.updateMany({
      where: { externalId: intent.id },
      data: { status: 'FAILED', webhookVerified: true },
    });

    const { bookingId, ticketPurchaseId } = intent.metadata;
    if (bookingId) {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'FAILED' } });
      this.eventEmitter.emit('booking.payment_failed', { bookingId });
    }
    if (ticketPurchaseId) {
      const purchase = await this.prisma.ticketPurchase.update({
        where: { id: ticketPurchaseId },
        data: { paymentStatus: 'FAILED' },
      });
      // Release hold
      await this.prisma.ticketTier.update({
        where: { id: purchase.ticketTierId },
        data: { heldQuantity: { decrement: purchase.quantity } },
      });
    }
  }

  private async onChargeRefunded(charge: Stripe.Charge) {
    const refundedAmount = charge.amount_refunded / 100;
    await this.prisma.payment.updateMany({
      where: { externalId: charge.payment_intent as string },
      data: {
        status: charge.refunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        refundedAmount,
      },
    });
    this.eventEmitter.emit('payment.refunded', { chargeId: charge.id, refundedAmount });
  }

  async issueRefund(paymentId: string, amount: number, actorId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== 'SUCCEEDED') throw new BadRequestException('Cannot refund this payment');

    const refund = await this.stripe.refunds.create({
      payment_intent: payment.externalId,
      amount: Math.round(amount * 100),
      reason: 'requested_by_customer',
    });

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PARTIALLY_REFUNDED', refundedAmount: amount },
    });

    await this.auditService.log({
      actorId,
      action: 'REFUND',
      entityType: 'Payment',
      entityId: paymentId,
      metadata: { amount, reason, stripeRefundId: refund.id },
    });

    return { refundId: refund.id, amount };
  }
}
