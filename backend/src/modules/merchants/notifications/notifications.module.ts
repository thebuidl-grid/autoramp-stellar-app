import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NotificationsService } from './notifications.service';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [DatabaseModule, HttpModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
