import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { NotificationsModule } from '../merchants/notifications/notifications.module';
import { PulseMfbService } from './pulsemfb.service';
import { PulseMfbWebhookService } from './pulsemfb-webhook.service';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../../common/services/audit.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HttpModule,
    NotificationsModule,
    AuditModule,
  ],
  providers: [PulseMfbService, PulseMfbWebhookService],
  exports: [PulseMfbService, PulseMfbWebhookService],
})
export class PulseMfbModule {}
