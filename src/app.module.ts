import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { WinstonModule } from 'nest-winston';
import { CacheModule } from '@nestjs/cache-manager';
import { TerminusModule } from '@nestjs/terminus';
import { createClient } from 'ioredis';

import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import storageConfig from './config/storage.config';
import paymentConfig from './config/payment.config';
import notificationConfig from './config/notification.config';
import { winstonConfig } from './config/winston.config';
import { validationSchema } from './config/env.validation';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { EventsModule } from './modules/events/events.module';
import { VenuesModule } from './modules/venues/venues.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { MenuModule } from './modules/menu/menu.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, redisConfig, storageConfig, paymentConfig, notificationConfig],
      validationSchema,
      validationOptions: { abortEarly: true },
    }),

    // Logging
    WinstonModule.forRootAsync({
      useFactory: () => winstonConfig,
    }),

    // Cache (Redis)
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const { createClient } = await import('cache-manager-ioredis-yet');
        return {
          store: createClient,
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
          ttl: 300,
        };
      },
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        { name: 'default', ttl: 60000, limit: 100 },
        { name: 'vendor', ttl: 60000, limit: 1000 },
      ],
      inject: [ConfigService],
    }),

    // Bull queues (Redis backed)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),

    // Event emitter (in-process events)
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', global: true }),

    // Cron / scheduled tasks
    ScheduleModule.forRoot(),

    // Health checks
    TerminusModule,

    // Core modules
    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    VenuesModule,
    BookingsModule,
    MenuModule,
    PaymentsModule,
    MediaModule,
    NotificationsModule,
    AdminModule,
    VendorsModule,
    AuditModule,
    HealthModule,
    JobsModule,
  ],
})
export class AppModule {}
