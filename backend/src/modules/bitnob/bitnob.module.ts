import { Module, Global, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { BitNobService } from './bitnob.service';
import { BitNobWebhookService } from './bitnob-webhook.service';
import { NotificationsModule } from '../merchants/notifications/notifications.module';
import { DatabaseModule } from '../../database/database.module';
import { SwapModule } from '../swap/swap.module';
import { OfframpStateModule } from '../ramp/offramp-state.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HttpModule,
    NotificationsModule,
    forwardRef(() => SwapModule),
    OfframpStateModule,
  ],
  providers: [BitNobService, BitNobWebhookService],
  exports: [BitNobService, BitNobWebhookService],
})
export class BitNobModule {}
