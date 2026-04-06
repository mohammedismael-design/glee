import { Controller, Get, Patch, Query, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole, PublishStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('moderation/events')
  @ApiOperation({ summary: 'List events pending moderation' })
  pendingEvents(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminService.getPendingEvents(+page, +limit);
  }

  @Get('moderation/menu-items')
  @ApiOperation({ summary: 'List menu items pending approval' })
  pendingMenuItems(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminService.getPendingMenuItems(+page, +limit);
  }

  @Get('moderation/venues')
  @ApiOperation({ summary: 'List venues pending approval' })
  pendingVenues(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminService.getPendingVenues(+page, +limit);
  }

  @Get('vendors')
  @ApiOperation({ summary: 'List vendors pending approval' })
  pendingVendors() {
    return this.adminService.getPendingVendors();
  }

  @Patch('vendors/:vendorId/approve')
  @ApiOperation({ summary: 'Approve vendor account' })
  approveVendor(
    @Param('vendorId') vendorId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.adminService.approveVendor(vendorId, actorId);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Browse audit logs' })
  auditLogs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.adminService.getAuditLogs(entityType, entityId, +page, +limit);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Admin dashboard metrics' })
  dashboard() {
    return this.adminService.getDashboardMetrics();
  }
}
