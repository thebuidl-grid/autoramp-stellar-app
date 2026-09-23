import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BridgeService } from './bridge.service';

/**
 * Periodically scans BURNED bridge transfers for a ready CCTP attestation
 * and completes the Stellar-side mint — mirrors
 * OfframpDepositWatcherService exactly (polling, isRunning guard,
 * per-item error isolation). Without this, a transfer would be stuck
 * once burned unless something actively polls Circle's attestation
 * service and relays the mint.
 */
@Injectable()
export class BridgeRelayerService {
  private readonly logger = new Logger(BridgeRelayerService.name);
  private isRunning = false;

  constructor(private readonly bridgeService: BridgeService) {}

  @Interval(15000)
  async checkPendingTransfers(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const { checked, completed } = await this.bridgeService.findAndCompletePendingTransfers();
      if (completed > 0) {
        this.logger.log(`Bridge relayer: completed ${completed}/${checked} pending transfer(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Bridge relayer run failed: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
