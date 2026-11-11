import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { MFBService } from './safehaven.service';
import { MFBWebhookService } from './safehaven-webhook.service';
import { WebhookHandlers } from './webhook-handlers.service';
import { NotificationsModule } from '../merchants/notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HttpModule,
    JwtModule.register({}),
    NotificationsModule,
    MailModule,
  ],
  providers: [MFBService, WebhookHandlers, MFBWebhookService],
  exports: [MFBService, WebhookHandlers, MFBWebhookService],
})
export class MFBModule {}
