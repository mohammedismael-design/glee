import { Controller, Get, Param, Query, UseGuards, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CUSTOMER_SUPPORT)
  @ApiOperation({ summary: 'List all users (admin)' })
  list(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('role') role?: UserRole,
  ) {
    return this.usersService.listUsers(+page, +limit, role);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CUSTOMER_SUPPORT)
  @ApiOperation({ summary: 'Get user by ID (admin)' })
  getOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Change user role (admin)' })
  updateRole(
    @CurrentUser('id') actorId: string,
    @Param('id') targetId: string,
    @Body('role') role: UserRole,
  ) {
    return this.usersService.updateRole(actorId, targetId, role);
  }
}
