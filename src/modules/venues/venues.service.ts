import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { AuditService } from '../audit/audit.service';
import * as slugify from 'slugify';

@Injectable()
export class VenuesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async list(page = 1, limit = 20, city?: string) {
    const where: any = { status: 'LIVE' };
    if (city) where.city = { contains: city, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, city: true, country: true, heroImageUrl: true, depositRequired: true },
      }),
      this.prisma.venue.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findBySlug(slug: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { slug },
      include: {
        tables: { where: { isActive: true } },
        menuCategories: { include: { items: { where: { isAvailable: true, status: 'LIVE' } } } },
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    return venue;
  }

  async create(vendorId: string, dto: CreateVenueDto, actorId: string) {
    const slug = await this.generateUniqueSlug(dto.name);
    const venue = await this.prisma.venue.create({
      data: { vendorId, slug, ...dto, status: 'DRAFT' },
    });
    await this.auditService.log({ actorId, action: 'CREATE', entityType: 'Venue', entityId: venue.id, after: venue });
    return venue;
  }

  async update(id: string, dto: Partial<CreateVenueDto>, actorId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue) throw new NotFoundException('Venue not found');
    const updated = await this.prisma.venue.update({ where: { id }, data: dto });
    await this.auditService.log({ actorId, action: 'UPDATE', entityType: 'Venue', entityId: id, before: venue, after: updated });
    return updated;
  }

  // Tables
  async createTable(venueId: string, dto: CreateTableDto) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new NotFoundException('Venue not found');
    return this.prisma.table.create({ data: { venueId, ...dto } });
  }

  async listTables(venueId: string) {
    return this.prisma.table.findMany({ where: { venueId, isActive: true } });
  }

  async updateTable(tableId: string, dto: Partial<CreateTableDto>) {
    return this.prisma.table.update({ where: { id: tableId }, data: dto });
  }

  // Time Slots
  async createTimeSlot(venueId: string, dto: CreateTimeSlotDto) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new NotFoundException('Venue not found');
    return this.prisma.timeSlot.create({
      data: {
        venueId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        label: dto.label,
        minimumSpend: dto.minimumSpend,
      },
    });
  }

  async listTimeSlots(venueId: string, dateFrom?: string, dateTo?: string) {
    const where: any = { venueId, isBlocked: false };
    if (dateFrom) where.startTime = { gte: new Date(dateFrom) };
    if (dateTo) where.startTime = { ...where.startTime, lte: new Date(dateTo) };
    return this.prisma.timeSlot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: { tables: true },
    });
  }

  async blockTimeSlot(slotId: string, isBlocked: boolean) {
    return this.prisma.timeSlot.update({ where: { id: slotId }, data: { isBlocked } });
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = (slugify as any)(name, { lower: true, strict: true });
    let slug = base;
    let counter = 0;
    while (await this.prisma.venue.findUnique({ where: { slug } })) {
      counter++;
      slug = `${base}-${counter}`;
    }
    return slug;
  }
}
