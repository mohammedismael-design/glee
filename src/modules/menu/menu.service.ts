import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishStatus } from '@prisma/client';
import {
  CreateMenuCategoryDto, CreateMenuItemDto, CreateBundleItemDto,
  UpdatePriceDto, CreateSpecialDto,
} from './dto/menu.dto';
import { AuditService } from '../audit/audit.service';
import * as slugify from 'slugify';

@Injectable()
export class MenuService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ── Categories ──────────────────────────────────────────────────────────────

  async createCategory(venueId: string, dto: CreateMenuCategoryDto) {
    const slug = (slugify as any)(dto.name, { lower: true, strict: true });
    return this.prisma.menuCategory.create({
      data: { venueId, name: dto.name, slug, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async listCategories(venueId: string) {
    return this.prisma.menuCategory.findMany({
      where: { venueId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { items: { where: { isAvailable: true, status: PublishStatus.LIVE } } },
    });
  }

  // ── Items ────────────────────────────────────────────────────────────────────

  async createItem(categoryId: string, dto: CreateMenuItemDto, actorId: string) {
    const item = await this.prisma.menuItem.create({
      data: {
        categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        isAvailable: dto.isAvailable ?? true,
        isBundle: dto.isBundle ?? false,
        upsellItemIds: dto.upsellItemIds ?? [],
        scheduledPublishAt: dto.scheduledPublishAt ? new Date(dto.scheduledPublishAt) : null,
        status: PublishStatus.DRAFT,
      },
    });
    await this.auditService.log({ actorId, action: 'CREATE', entityType: 'MenuItem', entityId: item.id, after: item });
    return item;
  }

  async updateItem(id: string, dto: Partial<CreateMenuItemDto>, actorId: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');
    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { ...dto, status: PublishStatus.PENDING },
    });
    await this.auditService.log({ actorId, action: 'UPDATE', entityType: 'MenuItem', entityId: id, before: item, after: updated });
    return updated;
  }

  async updatePrice(id: string, dto: UpdatePriceDto, actorId: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');

    // Record price history
    await this.prisma.priceHistory.create({
      data: { menuItemId: id, oldPrice: item.price, newPrice: dto.price, changedById: actorId, reason: dto.reason },
    });

    const updated = await this.prisma.menuItem.update({ where: { id }, data: { price: dto.price } });
    await this.auditService.log({
      actorId,
      action: 'PRICE_CHANGE',
      entityType: 'MenuItem',
      entityId: id,
      before: { price: item.price },
      after: { price: dto.price },
      metadata: { reason: dto.reason },
    });
    return updated;
  }

  async approveItem(id: string, actorId: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');
    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { status: item.scheduledPublishAt ? PublishStatus.PENDING : PublishStatus.LIVE },
    });
    await this.auditService.log({ actorId, action: 'APPROVE', entityType: 'MenuItem', entityId: id });
    return updated;
  }

  async rejectItem(id: string, actorId: string) {
    const updated = await this.prisma.menuItem.update({ where: { id }, data: { status: PublishStatus.REJECTED } });
    await this.auditService.log({ actorId, action: 'REJECT', entityType: 'MenuItem', entityId: id });
    return updated;
  }

  // ── Bundles ──────────────────────────────────────────────────────────────────

  async addBundleItem(bundleId: string, dto: CreateBundleItemDto) {
    const bundle = await this.prisma.menuItem.findUnique({ where: { id: bundleId } });
    if (!bundle || !bundle.isBundle) throw new NotFoundException('Bundle not found');
    return this.prisma.bundleItem.upsert({
      where: { bundleId_itemId: { bundleId, itemId: dto.itemId } },
      update: { quantity: dto.quantity },
      create: { bundleId, itemId: dto.itemId, quantity: dto.quantity },
    });
  }

  async getBundleItems(bundleId: string) {
    return this.prisma.bundleItem.findMany({
      where: { bundleId },
      include: { item: true },
    });
  }

  // ── Specials ─────────────────────────────────────────────────────────────────

  async createSpecial(venueId: string, dto: CreateSpecialDto) {
    return this.prisma.venueSpecial.create({
      data: {
        venueId,
        name: dto.name,
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        items: {
          create: dto.items.map((i) => ({
            menuItemId: i.menuItemId,
            specialPrice: i.specialPrice,
          })),
        },
      },
      include: { items: true },
    });
  }

  async listActiveSpecials(venueId: string) {
    const now = new Date();
    return this.prisma.venueSpecial.findMany({
      where: { venueId, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      include: { items: { include: { menuItem: true } } },
    });
  }

  async getPriceHistory(menuItemId: string) {
    return this.prisma.priceHistory.findMany({
      where: { menuItemId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
