import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  private encryptPii(value: string): string {
    const key = this.configService.get<string>('PII_ENCRYPTION_KEY', '');
    return CryptoJS.AES.encrypt(value, key).toString();
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async updateRole(actorId: string, targetId: string, role: UserRole) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id: targetId }, data: { role } });
  }

  async softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), deletionRequestAt: new Date(), isActive: false },
    });
  }

  async listUsers(page = 1, limit = 20, role?: UserRole) {
    const where = { deletedAt: null, ...(role ? { role } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, isActive: true, isEmailVerified: true,
          lastLoginAt: true, createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  private sanitize(user: any) {
    const { passwordHash, emailVerifyToken, passwordResetToken, ...safe } = user;
    return safe;
  }
}
