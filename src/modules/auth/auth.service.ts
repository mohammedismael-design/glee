import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const rounds = this.configService.get<number>('auth.bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'CUSTOMER',
        emailVerifyToken: uuidv4(),
      },
    });

    return this.generateTokenPair(user);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email, deletedAt: null } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return user;
  }

  async login(user: any) {
    return this.generateTokenPair(user);
  }

  async refreshTokens(refreshToken: string) {
    const record = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!record || record.isRevoked || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { isRevoked: true } });
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found');

    return this.generateTokenPair(user);
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { isRevoked: true },
    });
  }

  private async generateTokenPair(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload);

    const refreshSecret = this.configService.get<string>('auth.jwtRefreshSecret');
    const refreshExpiresIn = this.configService.get<string>('auth.jwtRefreshExpiresIn', '7d');
    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    });

    const days = refreshExpiresIn.endsWith('d')
      ? parseInt(refreshExpiresIn) * 86400000
      : 7 * 86400000;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + days),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }
}
