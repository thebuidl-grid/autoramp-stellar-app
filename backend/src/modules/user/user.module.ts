import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';

/**
 * User Module
 * 
 * Provides user-related functionality including:
 * - KYC submission
 * - Profile management
 * - API key creation for approved merchants
 */
@Module({
  imports: [ApiKeysModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule { }

