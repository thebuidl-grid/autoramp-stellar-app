import { Module } from '@nestjs/common';
import { UserBankAccountsService } from './user-bank-accounts.service';
import { UserBankAccountsController } from './user-bank-accounts.controller';
import { AuthModule } from '../../auth/auth.module';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UserBankAccountsController],
  providers: [UserBankAccountsService],
  exports: [UserBankAccountsService],
})
export class UserBankAccountsModule {}
