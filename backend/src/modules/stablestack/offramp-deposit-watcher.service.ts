import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StablestackService } from './stablestack.service';

/**
 * Periodically scans PENDING offramp transactions for a matching
 * memo-tagged CNGN deposit on Stellar, independent of the frontend ever
 * calling POST /stablestack/offramp/:reference/confirm-deposit. Without
 * this, an offramp can get stuck in PENDING forever if the user's
 * browser closes (or the confirm request just fails) right after they've
 * already sent the CNGN — the confirm endpoint stays the fast path for a
 * well-behaved client, this is the guarantee behind it.
 *
 * Polling rather than a persistent Horizon SSE stream: simpler to reason
 * about, trivially resilient to restarts (no cursor state to lose), and
 * more than fast enough for this volume. A real-time stream is a
 * reasonable future upgrade if latency ever becomes a real complaint.
 */
@Injectable()
export class OfframpDepositWatcherService {
  private readonly logger = new Logger(OfframpDepositWatcherService.name);
  private isRunning = false;

  constructor(private readonly stablestackService: StablestackService) {}

  @Interval(15000)
  async checkPendingDeposits(): Promise<void> {
    if (this.isRunning) return; // don't overlap if a previous run is still going
    this.isRunning = true;
    try {
      const { checked, confirmed } = await this.stablestackService.findAndConfirmPendingDeposits();
      if (confirmed > 0) {
        this.logger.log(`Deposit watcher: confirmed ${confirmed}/${checked} pending offramp(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Deposit watcher run failed: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
