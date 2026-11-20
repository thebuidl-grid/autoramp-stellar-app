import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BridgeService } from './bridge.service';
import { BridgeController } from './bridge.controller';
import { BridgeReconciliationService } from './bridge-reconciliation.service';
import { StellarRelayService } from './stellar-relay.service';
import { StellarRelayStore } from './stellar-relay.store';
import { EvmRelayService } from './evm-relay.service';
import { BridgeAutoRelayService } from './bridge-auto-relay.service';
import { DatabaseModule } from '../../database/database.module';
import { PayoutOrderModule } from '../ramp/payout-order.repository';

@Module({
  imports: [ConfigModule, HttpModule, DatabaseModule, PayoutOrderModule],
  controllers: [BridgeController],
  providers: [
    BridgeService,
    BridgeReconciliationService,
    StellarRelayService,
    StellarRelayStore,
    EvmRelayService,
    BridgeAutoRelayService,
  ],
  exports: [BridgeService],
})
export class BridgeModule {}
