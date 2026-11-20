import { Module } from '@nestjs/common';
import { PayoutOrderModule } from './payout-order.repository';
import { OfframpStateService } from './offramp-state.service';
import { SafehavenOfframpSettlementService } from './safehaven-offramp-settlement.service';
import { SafehavenOnrampSettlementService } from './safehaven-onramp-settlement.service';

/**
 * Off-ramp state machine persistence. Depends only on the global DatabaseModule (PrismaService),
 * so RampModule and BitNobModule can both import it without a circular dependency.
 */
@Module({
  imports: [PayoutOrderModule],
  providers: [OfframpStateService, SafehavenOfframpSettlementService, SafehavenOnrampSettlementService],
  exports: [OfframpStateService, SafehavenOfframpSettlementService, SafehavenOnrampSettlementService],
})
export class OfframpStateModule {}
