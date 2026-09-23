import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import {
  StablestackController,
  WebhookController,
} from './stablestack.controller';
import { StablestackService } from './stablestack.service';
import { WebhookService } from './webhook.service';
import { OfframpDepositWatcherService } from './offramp-deposit-watcher.service';
import { OnrampDeliveryService } from './onramp-delivery.service';
import { OfframpDeliveryService } from './offramp-delivery.service';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { SwapModule } from '../swap/swap.module';
import { StellarModule } from '../stellar/stellar.module';
import { CorridorModule } from '../corridor/corridor.module';
import { BridgeModule } from '../bridge/bridge.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    ApiKeysModule,
    AuthModule,
    StellarModule,
    CorridorModule,
    // Two-way dependency, both sides forwardRef'd: OnrampDeliveryService
    // (here) needs BridgeService for a Buy delivering to an EVM chain;
    // BridgeService needs OfframpDeliveryService (also here) for a Sell
    // paying out as fiat once a bridge transfer completes.
    forwardRef(() => BridgeModule),
    forwardRef(() => SwapModule), // Forward ref to avoid circular dependency
  ],
  controllers: [StablestackController, WebhookController],
  providers: [
    StablestackService,
    WebhookService,
    OfframpDepositWatcherService,
    OnrampDeliveryService,
    OfframpDeliveryService,
    // No RAMP_PROCESSOR token/provider — StablestackService and
    // WebhookService both resolve the default processor lazily, at call
    // time, via RampProcessorRegistry.get(). A NestJS provider factory
    // (the old design here) is constructed eagerly at app boot the
    // moment anything injects it, regardless of whether it's ever used —
    // found live: with RAMP_PROCESSOR_PROVIDER=safehaven and no SafeHaven
    // credentials set, the *entire app* failed to start, not just
    // SafeHaven-specific requests. Per-corridor selection (NG ->
    // SafeHaven, GH -> Paystack, simultaneously) was already lazy via
    // this same registry — this just closes the one eager path that
    // wasn't.
    RampProcessorRegistry,
  ],
  exports: [StablestackService, WebhookService, OfframpDeliveryService],
})
export class StablestackModule {}
