import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BridgeController } from './bridge.controller';
import { BridgeService } from './bridge.service';
import { BridgeRelayerService } from './bridge-relayer.service';
import { ChainRegistryService } from './chain-registry.service';
import { CctpAttestationClient } from './providers/cctp-attestation-client.service';
import { EvmRelayerService } from './providers/evm-relayer.service';
import { ZeroXSwapQuoteService } from './providers/zerox-swap-quote.service';
import { ChainTokenRegistryService } from './chain-token-registry.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { StellarModule } from '../stellar/stellar.module';
import { SwapModule } from '../swap/swap.module';
import { CorridorModule } from '../corridor/corridor.module';
import { StablestackModule } from '../stablestack/stablestack.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    ApiKeysModule,
    AuthModule,
    StellarModule,
    // Also forwardRef'd — SwapModule <-> StablestackModule was already a
    // circular pair (both sides forwardRef'd there already); adding
    // BridgeModule <-> StablestackModule below turns this into a 3-module
    // cycle (Bridge -> Swap -> Stablestack -> Bridge), so every edge in it
    // needs forwardRef, not just the newly-added ones, or Nest's module
    // scanner hits an undefined import mid-cycle depending on load order.
    forwardRef(() => SwapModule),
    CorridorModule,
    // See StablestackModule's import of BridgeModule for why this is
    // mutual/forwardRef'd — BridgeService needs OfframpDeliveryService for
    // a Sell paying out as fiat once a bridge transfer completes.
    forwardRef(() => StablestackModule),
  ],
  controllers: [BridgeController],
  providers: [
    BridgeService,
    BridgeRelayerService,
    ChainRegistryService,
    ChainTokenRegistryService,
    CctpAttestationClient,
    EvmRelayerService,
    ZeroXSwapQuoteService,
  ],
  exports: [BridgeService, ChainRegistryService, ChainTokenRegistryService],
})
export class BridgeModule {}
