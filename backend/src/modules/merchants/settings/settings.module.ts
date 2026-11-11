import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
