import { Injectable, NestInterceptor, ExecutionContext, CallHandler, ConflictException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers['x-idempotency-key'] as string;
    if (!key) return next.handle();

    const user = (req as any).user;
    if (!user) return next.handle();

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing && existing.response) {
      return new Observable((subscriber) => {
        subscriber.next(existing.response);
        subscriber.complete();
      });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const record = await this.prisma.idempotencyKey.upsert({
      where: { key },
      update: {},
      create: { key, userId: user.id, endpoint: req.url, expiresAt },
    });

    return next.handle().pipe(
      tap(async (data) => {
        await this.prisma.idempotencyKey.update({
          where: { id: record.id },
          data: { response: data },
        });
      }),
    );
  }
}
