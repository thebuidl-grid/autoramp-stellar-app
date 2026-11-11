import { Module } from '@nestjs/common';
import { UserWalletsService } from './user-wallets.service';
import { UserWalletsController } from './user-wallets.controller';
import { AuthModule } from '../../auth/auth.module';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UserWalletsController],
  providers: [UserWalletsService],
  exports: [UserWalletsService],
})
export class UserWalletsModule {}
