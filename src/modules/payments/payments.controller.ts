import {
  Controller, Post, Body, Param, Req, Headers, RawBodyRequest, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('bookings/:bookingId/intent')
  @ApiOperation({ summary: 'Create Stripe payment intent for a booking' })
  createBookingIntent(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.createBookingPaymentIntent(bookingId, userId);
  }

  @Post('tickets/:purchaseId/intent')
  @ApiOperation({ summary: 'Create Stripe payment intent for ticket purchase' })
  createTicketIntent(
    @Param('purchaseId') purchaseId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.createTicketPaymentIntent(purchaseId, userId);
  }

  @Post(':paymentId/refund')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FINANCE_ADMIN)
  @ApiOperation({ summary: 'Issue full or partial refund' })
  refund(
    @Param('paymentId') paymentId: string,
    @CurrentUser('id') actorId: string,
    @Body('amount') amount: number,
    @Body('reason') reason?: string,
  ) {
    return this.paymentsService.issueRefund(paymentId, amount, actorId, reason);
  }

  /**
   * Stripe webhook endpoint — must receive raw body.
   * Excludes JWT guard (uses webhook signature verification instead).
   */
  @Public()
  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Stripe webhook receiver (signature verified)' })
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentsService.handleStripeWebhook(req.rawBody, signature);
  }
}
