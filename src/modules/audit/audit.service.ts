import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '@prisma/client';

export interface AuditPayload {
  actorId: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  subjectId?: string;
  subjectType?: string;
  before?: any;
  after?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(payload: AuditPayload) {
    return this.prisma.auditLog.create({
      data: {
        actorId: payload.actorId,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        subjectId: payload.subjectId,
        subjectType: payload.subjectType,
        before: payload.before,
        after: payload.after,
        metadata: payload.metadata,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
      },
    });
  }

  async findByEntity(entityType: string, entityId: string, page = 1, limit = 50) {
    const where = { entityType, entityId };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findByActor(actorId: string, page = 1, limit = 50) {
    const where = { actorId };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
