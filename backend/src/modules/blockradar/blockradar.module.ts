import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { BlockRadarService } from './blockradar.service';
import { BlockRadarWebhookService } from './blockradar-webhook.service';
import { BlockRadarController } from './blockradar.controller';
import { NotificationsModule } from '../merchants/notifications/notifications.module';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, HttpModule, NotificationsModule],
  providers: [BlockRadarService, BlockRadarWebhookService],
  controllers: [BlockRadarController],
  exports: [BlockRadarService, BlockRadarWebhookService],
})
export class BlockRadarModule {}
