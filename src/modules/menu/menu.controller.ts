import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MenuService } from './menu.service';
import {
  CreateMenuCategoryDto, CreateMenuItemDto, CreateBundleItemDto,
  UpdatePriceDto, CreateSpecialDto,
} from './dto/menu.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('menu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'menu', version: '1' })
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Public()
  @Get('venues/:venueId/categories')
  @ApiOperation({ summary: 'Get menu categories for a venue' })
  listCategories(@Param('venueId') venueId: string) {
    return this.menuService.listCategories(venueId);
  }

  @Post('venues/:venueId/categories')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create menu category' })
  createCategory(@Param('venueId') venueId: string, @Body() dto: CreateMenuCategoryDto) {
    return this.menuService.createCategory(venueId, dto);
  }

  @Post('categories/:categoryId/items')
  @Roles(UserRole.VENDOR, UserRole.VENDOR_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create menu item' })
  createItem(
    @Param('categoryId') categoryId: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.menuService.createItem(categoryId, dto, actorId);
  }

  @Patch('items/:id')
  @Roles(UserRole.VENDOR, UserRole.VENDOR_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update menu item (goes to pending approval)' })
  updateItem(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: Partial<CreateMenuItemDto>,
  ) {
    return this.menuService.updateItem(id, dto, actorId);
  }

  @Patch('items/:id/price')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMMERCIAL_MANAGER)
  @ApiOperation({ summary: 'Update item price (logged for audit)' })
  updatePrice(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.menuService.updatePrice(id, dto, actorId);
  }

  @Patch('items/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMMERCIAL_MANAGER)
  @ApiOperation({ summary: 'Approve menu item' })
  approveItem(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.menuService.approveItem(id, actorId);
  }

  @Patch('items/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject menu item' })
  rejectItem(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.menuService.rejectItem(id, actorId);
  }

  @Get('items/:id/price-history')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.FINANCE_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Get price change history for item' })
  priceHistory(@Param('id') id: string) {
    return this.menuService.getPriceHistory(id);
  }

  // Bundles
  @Post('bundles/:bundleId/items')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add item to bundle' })
  addBundleItem(@Param('bundleId') bundleId: string, @Body() dto: CreateBundleItemDto) {
    return this.menuService.addBundleItem(bundleId, dto);
  }

  @Get('bundles/:bundleId/items')
  @ApiOperation({ summary: 'Get bundle items' })
  getBundleItems(@Param('bundleId') bundleId: string) {
    return this.menuService.getBundleItems(bundleId);
  }

  // Specials
  @Post('venues/:venueId/specials')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMMERCIAL_MANAGER)
  @ApiOperation({ summary: 'Create venue special / time-limited offer' })
  createSpecial(@Param('venueId') venueId: string, @Body() dto: CreateSpecialDto) {
    return this.menuService.createSpecial(venueId, dto);
  }

  @Public()
  @Get('venues/:venueId/specials')
  @ApiOperation({ summary: 'List active specials for venue' })
  listSpecials(@Param('venueId') venueId: string) {
    return this.menuService.listActiveSpecials(venueId);
  }
}
