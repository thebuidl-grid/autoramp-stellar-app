import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BridgeService } from './bridge.service';
import { BridgeController } from './bridge.controller';
import { BridgeReconciliationService } from './bridge-reconciliation.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [ConfigModule, HttpModule, DatabaseModule],
  controllers: [BridgeController],
  providers: [BridgeService, BridgeReconciliationService],
  exports: [BridgeService],
})
export class BridgeModule {}
