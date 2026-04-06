import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationListeners } from './notification.listeners';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [NotificationsService, NotificationListeners],
  exports: [NotificationsService],
})
export class NotificationsModule {}
