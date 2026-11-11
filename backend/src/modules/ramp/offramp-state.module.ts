import { Module } from '@nestjs/common';
import { OfframpStateService } from './offramp-state.service';

/**
 * Off-ramp state machine persistence. Depends only on the global DatabaseModule (PrismaService),
 * so RampModule and BitNobModule can both import it without a circular dependency.
 */
@Module({
  providers: [OfframpStateService],
  exports: [OfframpStateService],
})
export class OfframpStateModule {}
