import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserBankAccountsModule } from './bank-accounts/user-bank-accounts.module';
import { UserWalletsModule } from './wallets/user-wallets.module';
import { DatabaseModule } from '../../database/database.module';
// import { ApiKeysModule } from '../api-keys/api-keys.module';

/**
 * User Module
 *
 * Provides user-related functionality including:
 * - KYC submission
 * - Profile management
 * - API key creation for approved merchants
 */
@Module({
  // imports: [ApiKeysModule],
  imports: [DatabaseModule, UserBankAccountsModule, UserWalletsModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
