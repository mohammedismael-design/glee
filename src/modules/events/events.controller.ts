import {
  Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateTicketTierDto } from './dto/create-ticket-tier.dto';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'events', version: '1' })
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public events (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'venueId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  list(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query() filters: any,
  ) {
    return this.eventsService.list(+page, +limit, filters);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get event detail by slug' })
  findOne(@Param('slug') slug: string) {
    return this.eventsService.findBySlug(slug);
  }

  @Post()
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new event (vendor)' })
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.vendorProfile?.id || user.id, dto, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update event' })
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: Partial<CreateEventDto>) {
    return this.eventsService.update(id, dto, user.id);
  }

  @Patch(':id/submit')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Submit event for admin review' })
  submit(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.eventsService.submitForReview(id, userId);
  }

  @Patch(':id/moderate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.CONTENT_MANAGER)
  @ApiOperation({ summary: 'Approve or reject a pending event' })
  moderate(
    @Param('id') id: string,
    @CurrentUser('id') moderatorId: string,
    @Body('action') action: 'approve' | 'reject',
    @Body('note') note?: string,
  ) {
    return this.eventsService.moderate(id, action, moderatorId, note);
  }

  @Post(':id/tiers')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add ticket tier to event' })
  addTier(@Param('id') eventId: string, @CurrentUser() user: any, @Body() dto: CreateTicketTierDto) {
    return this.eventsService.addTicketTier(eventId, dto, user.id);
  }

  @Post('tickets/hold')
  @ApiOperation({ summary: 'Hold ticket inventory for 10 minutes' })
  holdInventory(
    @CurrentUser('id') userId: string,
    @Body('ticketTierId') ticketTierId: string,
    @Body('quantity') quantity: number,
    @Body('idempotencyKey') idempotencyKey: string,
  ) {
    return this.eventsService.holdInventory(ticketTierId, userId, quantity, idempotencyKey);
  }

  @Post('tickets/purchase')
  @ApiOperation({ summary: 'Purchase tickets (initiates payment)' })
  purchase(@CurrentUser('id') userId: string, @Body() dto: PurchaseTicketDto) {
    return this.eventsService.purchaseTicket(userId, dto);
  }
}
