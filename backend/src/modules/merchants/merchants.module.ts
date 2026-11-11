import { Module } from '@nestjs/common';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { DirectorsModule } from './directors/directors.module';
import { ShareholdersModule } from './shareholders/shareholders.module';
import { DocumentationsModule } from './documentations/documentations.module';
import { TransactionsModule } from './transactions/transactions.module';
import { MerchantStatusModule } from './merchant-status/merchant-status.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { MerchantBankModule } from './bank/merchant-bank.module';

@Module({
  imports: [
    MerchantBankModule,
    OnboardingModule,
    ApiKeysModule,
    DirectorsModule,
    ShareholdersModule,
    DocumentationsModule,
    TransactionsModule,
    MerchantStatusModule,
    NotificationsModule,
    SettingsModule,
  ],
  exports: [
    OnboardingModule,
    ApiKeysModule,
    DirectorsModule,
    ShareholdersModule,
    DocumentationsModule,
    TransactionsModule,
    MerchantStatusModule,
    NotificationsModule,
    SettingsModule,
    MerchantBankModule,
  ],
})
export class MerchantsModule {}
