import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';
import * as twilio from 'twilio';
import * as QRCode from 'qrcode';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter;
  private twilioClient: twilio.Twilio;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.get('notification.email.smtpHost'),
      port: configService.get('notification.email.smtpPort'),
      secure: configService.get('notification.email.smtpSecure'),
      auth: {
        user: configService.get('notification.email.smtpUser'),
        pass: configService.get('notification.email.smtpPass'),
      },
    });

    const sid = configService.get('notification.sms.accountSid');
    const token = configService.get('notification.sms.authToken');
    if (sid && token) {
      this.twilioClient = twilio.default(sid, token);
    }
  }

  async sendBookingConfirmation(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        table: true,
        timeSlot: { include: { venue: true } },
      },
    });
    if (!booking) return;

    const venue = booking.timeSlot?.venue;
    const subject = `Booking Confirmed — ${venue?.name ?? 'Glee'}`;
    const body = `Hi ${booking.user.firstName},\n\nYour booking at ${venue?.name} on ${booking.timeSlot?.startTime.toLocaleString()} is confirmed.\n\nBooking ID: ${booking.id}\n\nThank you for choosing Glee!`;

    await this.send(booking.userId, NotificationChannel.EMAIL, subject, body, {
      to: booking.user.email,
    });
  }

  async sendTicketConfirmation(ticketPurchaseId: string) {
    const purchase = await this.prisma.ticketPurchase.findUnique({
      where: { id: ticketPurchaseId },
      include: { user: true, ticketTier: { include: { event: true } } },
    });
    if (!purchase) return;

    // Generate QR code
    const qrData = JSON.stringify({ purchaseId: purchase.id, userId: purchase.userId });
    const qrCodeDataUrl = await QRCode.toDataURL(qrData);

    await this.prisma.ticketPurchase.update({
      where: { id: ticketPurchaseId },
      data: { qrCodeData: qrData },
    });

    const event = purchase.ticketTier?.event;
    const subject = `Your Tickets — ${event?.title ?? 'Event'}`;
    const body = `Hi ${purchase.user.firstName},\n\nYour ${purchase.quantity}x ${purchase.ticketTier?.name} ticket(s) for ${event?.title} are confirmed.\n\nYour QR code is attached.\n\nSee you there!`;

    await this.send(purchase.userId, NotificationChannel.EMAIL, subject, body, {
      to: purchase.user.email,
      attachments: [
        {
          filename: 'ticket-qr.png',
          content: qrCodeDataUrl.split(',')[1],
          encoding: 'base64',
          contentType: 'image/png',
        },
      ],
    });
  }

  async sendBookingStatusUpdate(bookingId: string, status: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true, timeSlot: { include: { venue: true } } },
    });
    if (!booking) return;

    const venueName = booking.timeSlot?.venue?.name ?? 'Glee';
    const messages: Record<string, string> = {
      CONFIRMED: `Great news! Your booking at ${venueName} is confirmed.`,
      DECLINED: `Unfortunately, your booking at ${venueName} has been declined.`,
      CANCELLED: `Your booking at ${venueName} has been cancelled.`,
      AWAITING_PAYMENT: `Your booking at ${venueName} is awaiting payment.`,
      NO_SHOW: `Your booking at ${venueName} was marked as no-show.`,
    };

    const message = messages[status] || `Your booking status has been updated to: ${status}`;
    await this.send(booking.userId, NotificationChannel.EMAIL, `Booking Update — ${venueName}`, message, {
      to: booking.user.email,
    });

    // SMS if phone available
    if (booking.user.phone && this.twilioClient) {
      await this.sendSms(booking.user.phone, message);
    }
  }

  async send(
    userId: string,
    channel: NotificationChannel,
    subject: string,
    body: string,
    metadata?: any,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, channel, subject, body, metadata, status: 'QUEUED' },
    });

    try {
      if (channel === NotificationChannel.EMAIL) {
        await this.transporter.sendMail({
          from: `"${this.configService.get('notification.email.fromName')}" <${this.configService.get('notification.email.fromAddress')}>`,
          to: metadata?.to,
          subject,
          text: body,
          attachments: metadata?.attachments,
        });
      } else if (channel === NotificationChannel.SMS && metadata?.phone) {
        await this.sendSms(metadata.phone, body);
      }

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      this.logger.error(`Notification ${notification.id} failed: ${err.message}`);
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED', error: err.message },
      });
    }
  }

  private async sendSms(to: string, body: string) {
    if (!this.twilioClient) {
      this.logger.warn('Twilio not configured — SMS not sent');
      return;
    }
    await this.twilioClient.messages.create({
      body,
      from: this.configService.get('notification.sms.fromNumber'),
      to,
    });
  }
}
