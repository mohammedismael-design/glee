import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BookingStatus, UserRole } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'bookings', version: '1' })
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new table booking (atomic, prevents double-booking)' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List current user bookings' })
  myBookings(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.bookingsService.listByUser(userId, +page, +limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking detail' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findById(id);
  }

  @Get('venue/:venueId')
  @Roles(
    UserRole.VENDOR, UserRole.VENDOR_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN,
    UserRole.OPERATIONS_MANAGER, UserRole.CUSTOMER_SUPPORT,
  )
  @ApiOperation({ summary: 'List bookings for a venue' })
  byVenue(
    @Param('venueId') venueId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('status') status?: BookingStatus,
  ) {
    return this.bookingsService.listByVenue(venueId, +page, +limit, status);
  }

  @Patch(':id/status')
  @Roles(
    UserRole.VENDOR, UserRole.VENDOR_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN,
    UserRole.OPERATIONS_MANAGER,
  )
  @ApiOperation({ summary: 'Update booking status (vendor/admin)' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body('status') status: BookingStatus,
    @Body('reason') reason?: string,
  ) {
    return this.bookingsService.updateStatus(id, status, actorId, reason);
  }

  @Patch(':id/override')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OPERATIONS_MANAGER)
  @ApiOperation({ summary: 'Admin override booking status' })
  override(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body('status') status: BookingStatus,
    @Body('reason') reason?: string,
  ) {
    return this.bookingsService.updateStatus(id, status, actorId, reason, true);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel own booking' })
  cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.bookingsService.cancel(id, userId);
  }
}
