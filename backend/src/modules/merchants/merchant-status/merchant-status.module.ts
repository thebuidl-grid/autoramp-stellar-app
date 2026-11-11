import { Module } from '@nestjs/common';
import { MerchantStatusController } from './merchant-status.controller';
import { DatabaseModule } from '../../../database/database.module';
import { MerchantBankModule } from '../bank/merchant-bank.module';

@Module({
  imports: [DatabaseModule, MerchantBankModule],
  controllers: [MerchantStatusController],
})
export class MerchantStatusModule {}
