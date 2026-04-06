import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('venues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'venues', version: '1' })
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public venues' })
  list(@Query('page') page = 1, @Query('limit') limit = 20, @Query('city') city?: string) {
    return this.venuesService.list(+page, +limit, city);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get venue profile by slug' })
  findOne(@Param('slug') slug: string) {
    return this.venuesService.findBySlug(slug);
  }

  @Post()
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new venue' })
  create(@CurrentUser() user: any, @Body() dto: CreateVenueDto) {
    return this.venuesService.create(user.vendorProfile?.id || user.id, dto, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OPERATIONS_MANAGER)
  @ApiOperation({ summary: 'Update venue' })
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: Partial<CreateVenueDto>) {
    return this.venuesService.update(id, dto, userId);
  }

  // Tables
  @Get(':id/tables')
  @ApiOperation({ summary: 'List venue tables' })
  listTables(@Param('id') venueId: string) {
    return this.venuesService.listTables(venueId);
  }

  @Post(':id/tables')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OPERATIONS_MANAGER)
  @ApiOperation({ summary: 'Add table to venue' })
  addTable(@Param('id') venueId: string, @Body() dto: CreateTableDto) {
    return this.venuesService.createTable(venueId, dto);
  }

  @Patch(':id/tables/:tableId')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OPERATIONS_MANAGER)
  @ApiOperation({ summary: 'Update table' })
  updateTable(@Param('tableId') tableId: string, @Body() dto: Partial<CreateTableDto>) {
    return this.venuesService.updateTable(tableId, dto);
  }

  // Time Slots
  @Get(':id/timeslots')
  @ApiOperation({ summary: 'List time slots for venue' })
  listSlots(
    @Param('id') venueId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.venuesService.listTimeSlots(venueId, dateFrom, dateTo);
  }

  @Post(':id/timeslots')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OPERATIONS_MANAGER)
  @ApiOperation({ summary: 'Create time slot' })
  createSlot(@Param('id') venueId: string, @Body() dto: CreateTimeSlotDto) {
    return this.venuesService.createTimeSlot(venueId, dto);
  }

  @Patch('timeslots/:slotId/block')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OPERATIONS_MANAGER)
  @ApiOperation({ summary: 'Block/unblock a time slot' })
  blockSlot(@Param('slotId') slotId: string, @Body('isBlocked') isBlocked: boolean) {
    return this.venuesService.blockTimeSlot(slotId, isBlocked);
  }
}
