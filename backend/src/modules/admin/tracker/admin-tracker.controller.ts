import {
  Controller,
  Get,
  Param,
  Post,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AdminWebhooksService } from './admin-webhooks.service';
import { HealthQueryDto, WebhooksQueryDto } from './tracker.dto';
import { TransactionHealthService } from './transaction-health.service';
import { TransactionTraceService } from './transaction-trace.service';
import { PaymentCheckService } from 'src/modules/ramp/payment-check.service';

/**
 * Admin transaction tracking and reconciliation: follow transactions and recheck stalled off-ramp settlements.
 * Mounted under /admin by the router, so these are /admin/transactions/... . Every route needs an admin.
 */
@ApiTags('Admin')
@Controller('transactions')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminTrackerController {
  constructor(
    private readonly trace: TransactionTraceService,
    private readonly health: TransactionHealthService,
    private readonly webhooks: AdminWebhooksService,
    private readonly paymentCheck: PaymentCheckService,
  ) {}

  // Fixed paths are declared before ':reference/trace' so they can never be read as a reference.

  @Get('attention')
  @ApiOperation({
    summary:
      'Counts for the dashboard: failed and stuck transactions, and webhooks tied to nothing',
  })
  async attention() {
    const [counts, unmatchedWebhooks] = await Promise.all([
      this.health.counts(),
      this.webhooks.countUnmatched(),
    ]);
    return { ...counts, unmatchedWebhooks };
  }

  @Get('stuck')
  @ApiOperation({
    summary:
      'Transactions that have not progressed for longer than their status allows, oldest first',
  })
  stuck(@Query() q: HealthQueryDto) {
    return this.health.list('stuck', {
      type: q.type,
      provider: q.provider,
      olderThanMinutes: q.olderThanMinutes,
      limit: q.limit ?? 25,
      offset: q.offset ?? 0,
    });
  }

  @Get('failed')
  @ApiOperation({
    summary:
      'Failed, rejected, reversed and expired transactions, newest first',
  })
  failed(@Query() q: HealthQueryDto) {
    return this.health.list('failed', {
      type: q.type,
      provider: q.provider,
      limit: q.limit ?? 25,
      offset: q.offset ?? 0,
    });
  }

  @Get(':reference/trace')
  @ApiOperation({
    summary:
      'Everything we know about one transaction: provider legs, step log and webhook events in time order',
  })
  traceOne(@Param('reference') reference: string) {
    return this.trace.trace(reference);
  }

  @Post(':reference/reconcile')
  @ApiOperation({
    summary:
      'Recheck an off-ramp with its providers and apply any newly reported payout or settlement update',
  })
  reconcileOfframp(@Param('reference') reference: string) {
    return this.paymentCheck.reconcileOfframp(reference);
  }
}

/** /admin/webhooks: provider events and the ones we could not tie to a transaction. */
@ApiTags('Admin')
@Controller('webhooks')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminWebhooksController {
  constructor(private readonly webhooks: AdminWebhooksService) {}

  @Get()
  @ApiOperation({
    summary:
      'Provider webhook events, newest first. matched=false lists events tied to no transaction',
  })
  list(@Query() q: WebhooksQueryDto) {
    return this.webhooks.list({
      provider: q.provider,
      matched: q.matched,
      processed: q.processed,
      limit: q.limit ?? 25,
      offset: q.offset ?? 0,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'One webhook event with its stored payload and the raw receipt it came from',
  })
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.detail(id);
  }
}
