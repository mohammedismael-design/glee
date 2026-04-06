import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { VendorsService } from './vendors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'vendors', version: '1' })
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register as a vendor' })
  register(
    @CurrentUser('id') userId: string,
    @Body('businessName') businessName: string,
    @Body('contactEmail') contactEmail: string,
  ) {
    return this.vendorsService.register(userId, businessName, contactEmail);
  }

  @Get('me')
  @Roles(UserRole.VENDOR, UserRole.VENDOR_STAFF)
  @ApiOperation({ summary: 'Get vendor profile and summary' })
  profile(@CurrentUser('id') userId: string) {
    return this.vendorsService.getProfile(userId);
  }

  @Get('me/dashboard')
  @Roles(UserRole.VENDOR, UserRole.VENDOR_STAFF)
  @ApiOperation({ summary: 'Vendor dashboard — bookings, events summary' })
  dashboard(@CurrentUser('id') userId: string) {
    return this.vendorsService.getDashboard(userId);
  }

  @Get('me/reports/sales')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Vendor sales report (downloadable)' })
  salesReport(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Note: in real usage this would stream a CSV. For API simplicity returns JSON.
    return this.vendorsService.getSalesReport(userId, from, to);
  }

  @Post('venues/:venueId/block-dates')
  @Roles(UserRole.VENDOR, UserRole.OPERATIONS_MANAGER)
  @ApiOperation({ summary: 'Block out dates for a venue' })
  blockDates(
    @Param('venueId') venueId: string,
    @CurrentUser('id') vendorId: string,
    @Body('dates') dates: string[],
  ) {
    return this.vendorsService.blockDates(venueId, dates, vendorId);
  }
}
