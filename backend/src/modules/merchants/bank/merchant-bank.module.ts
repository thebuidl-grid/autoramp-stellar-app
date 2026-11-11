import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MerchantDashboardController } from './merchant-bank.controller';
import { MerchantApiController } from './merchant-api.controller';
import { MerchantBankService } from './merchant-bank.service';
import { AuthModule } from '../../auth/auth.module';
import { SettingsModule } from '../settings/settings.module.js';
import { NotificationsModule } from '../notifications/notifications.module';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [MerchantDashboardController, MerchantApiController],
  providers: [MerchantBankService],
  exports: [MerchantBankService],
})
export class MerchantBankModule {}
