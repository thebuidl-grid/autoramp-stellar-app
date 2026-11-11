import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  LiquidityCheck,
  OfframpState,
  checkLiquidity,
  computeSettlement,
  describeState,
  normalizeStatus,
  reconciliationResult,
  shortestPath,
  toUnits,
} from './offramp-state-machine';

export interface ApplyOptions {
  /** Normalized failure reason (timeout, partial_settlement, rejected, reversal, insufficient_liquidity, ...). */
  reason?: string | null;
  /** Structured detail behind the reason: provider response, liquidity shortfall, timeout window, ... */
  detail?: Record<string, unknown>;
  /** Who caused the change: 'bitnob-webhook' | 'expiry-sweeper' | 'user' | 'system' | ... */
  actor?: string;
  /** Idempotency key for provider/settlement events. The same key can never be applied twice. */
  eventKey?: string;
  eventType?: string;
  payload?: unknown;
  /** USDC actually received (used for the settlement comparison). */
  receivedAmount?: string | null;
  /** Stellar transaction hash of the deposit. */
  txHash?: string | null;
  providerStatus?: string;
  providerOrderId?: string;
  /** NGN actually paid out. */
  settledFiatAmount?: string | null;
  /** Reversal details (only used when the target is REVERSED). */
  reversal?: { amount?: string; reason?: string; providerEventId?: string };
  now?: Date;
}

export type ApplyOutcome =
  | 'APPLIED'
  | 'DUPLICATE' // event already applied (idempotent) or reversal already recorded
  | 'REJECTED_TRANSITION' // state machine refused it; nothing changed; logged
  | 'NOOP' // already in the target state
  | 'NOT_FOUND'
  | 'CONFLICT'; // concurrent modification; nothing changed

export interface ApplyResult {
  outcome: ApplyOutcome;
  reference?: string;
  from?: string | null;
  to: OfframpState;
  /** States entered, in order (inferred intermediate steps first, the target last). */
  steps: OfframpState[];
  liquidity?: LiquidityCheck;
}

class ConflictError extends Error {}

const DEFAULT_REASON: Partial<Record<OfframpState, string>> = {
  PARTIALLY_SETTLED: 'partial_settlement',
  EXPIRED: 'timeout',
  REJECTED: 'rejected',
  REVERSED: 'reversal',
  INSUFFICIENT_LIQUIDITY: 'insufficient_liquidity',
  FAILED: 'failed',
};

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2002';
}

@Injectable()
export class OfframpStateService {
  private readonly logger = new Logger(OfframpStateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Simulated payout liquidity (USDC). Unset = no liquidity gate. Configure with OFFRAMP_SIMULATED_LIQUIDITY_USDC. */
  availableLiquidity(env: Record<string, string | undefined> = process.env): string | undefined {
    const raw = env.OFFRAMP_SIMULATED_LIQUIDITY_USDC;
    if (raw === undefined || raw.trim() === '') return undefined;
    return /^\d+(\.\d+)?$/.test(raw.trim()) ? raw.trim() : undefined;
  }

  /** Every attempted cash-out gets a reconciliation record from the moment it is created. */
  async recordInitiated(transactionId: string): Promise<void> {
    const tx = await this.prisma.offrampTransaction.findUnique({
      where: { id: transactionId },
      include: { providerOrder: true },
    });
    if (!tx) return;
    const po = tx.providerOrder;
    const expected = po?.expectedAmount != null ? po.expectedAmount.toString() : '0';
    const record = {
      reference: tx.reference,
      externalReference: po?.providerOrderId ?? po?.reference ?? null,
      stellarTxHash: po?.depositTxHash ?? null,
      asset: 'USDC',
      amount: expected,
      expectedSettlement: expected,
      actualSettlement: '0',
      outstandingAmount: '0',
      status: normalizeStatus(tx.status) ?? 'INITIATED',
      result: 'IN_PROGRESS',
    };
    await this.prisma.offrampReconciliation.upsert({
      where: { offrampTransactionId: tx.id },
      create: { offrampTransactionId: tx.id, ...record },
      update: {},
    });
    await this.log(tx, 'cash_out_initiated', { new: record.status, description: 'Cash-out attempt recorded', metadata: { expected } });
  }

  /**
   * Move a transaction to `target`, walking (and recording) any intermediate progress states.
   * Atomic: status, history, provider order, reversal, event key and reconciliation commit together or not at all.
   * Never throws for invalid or duplicate requests — it reports the outcome and logs it.
   */
  async apply(transactionId: string, target: OfframpState, opts: ApplyOptions = {}): Promise<ApplyResult> {
    const tx = await this.prisma.offrampTransaction.findUnique({
      where: { id: transactionId },
      include: { providerOrder: true },
    });
    if (!tx) return { outcome: 'NOT_FOUND', to: target, steps: [] };

    const base = { reference: tx.reference, from: tx.status as string, to: target };
    const actor = opts.actor ?? 'system';

    // Idempotency: an event key that was already applied is acknowledged and ignored.
    if (opts.eventKey) {
      const seen = await this.prisma.offrampEvent.findUnique({ where: { eventKey: opts.eventKey } });
      if (seen) {
        await this.log(tx, 'duplicate_event_ignored', {
          old: tx.status,
          new: target,
          description: `Duplicate event ${opts.eventKey} ignored`,
          metadata: { actor, eventKey: opts.eventKey },
        });
        return { ...base, outcome: 'DUPLICATE', steps: [] };
      }
    }

    const from = normalizeStatus(tx.status);
    if (from === target) return { ...base, outcome: 'NOOP', steps: [] };

    const steps = from ? shortestPath(from, target) : null;
    if (!steps) {
      await this.log(tx, 'transition_rejected', {
        old: tx.status,
        new: target,
        description: `${tx.status} -> ${target} is not an allowed transition`,
        metadata: { actor, eventKey: opts.eventKey ?? null, ...(opts.reason ? { reason: opts.reason } : {}) },
      });
      this.logger.warn(`[offramp-state] ${tx.reference}: rejected invalid transition ${tx.status} -> ${target}`);
      return { ...base, outcome: 'REJECTED_TRANSITION', steps: [] };
    }

    try {
      await this.prisma.$transaction(async (db: any) => {
        const now = opts.now ?? new Date();
        const po = tx.providerOrder;
        const expected = po?.expectedAmount != null ? po.expectedAmount.toString() : null;
        const received =
          opts.receivedAmount != null ? opts.receivedAmount : po?.receivedAmount != null ? po.receivedAmount.toString() : null;
        const settlement = computeSettlement(expected ?? '0', received ?? '0');
        const reason = opts.reason ?? DEFAULT_REASON[target] ?? null;

        if (opts.eventKey) {
          await db.offrampEvent.create({
            data: {
              offrampTransactionId: tx.id,
              eventKey: opts.eventKey,
              type: opts.eventType ?? target,
              payload: (opts.payload as any) ?? undefined,
            },
          });
        }

        let current: string = tx.status;
        for (const step of steps) {
          const isLast = step === target;
          const data: Record<string, unknown> = { status: step };
          if (isLast && step === 'COMPLETED') data.completedAt = now;
          if (isLast && opts.settledFiatAmount != null) data.settledFiatAmount = opts.settledFiatAmount;
          const res = await db.offrampTransaction.updateMany({ where: { id: tx.id, status: current }, data });
          if (res.count !== 1) throw new ConflictError(`${tx.reference} changed while applying ${target}`);
          await db.transactionLog.create({
            data: {
              transactionType: 'offramp',
              transactionId: tx.id,
              userId: tx.userId,
              action: 'status_transition',
              oldStatus: current,
              newStatus: step,
              description: isLast ? (reason ?? `${current} -> ${step}`) : `Inferred step on the way to ${target}`,
              metadata: {
                actor,
                eventKey: opts.eventKey ?? null,
                synthetic: !isLast,
                ...(isLast && opts.detail ? { detail: opts.detail } : {}),
              } as any,
            },
          });
          current = step;
        }

        if (po) {
          const poData: Record<string, unknown> = {};
          if (opts.providerStatus) poData.providerStatus = opts.providerStatus;
          if (opts.providerOrderId) poData.providerOrderId = opts.providerOrderId;
          if (opts.receivedAmount != null) poData.receivedAmount = opts.receivedAmount;
          if (opts.txHash) poData.depositTxHash = opts.txHash;
          if (reason) poData.failureReason = reason;
          if (opts.detail) poData.failureDetail = opts.detail;
          if (target === 'PARTIALLY_SETTLED' || opts.receivedAmount != null) poData.outstandingAmount = settlement.outstanding;
          if (Object.keys(poData).length) await db.offrampProviderOrder.update({ where: { id: po.id }, data: poData });
        }

        if (target === 'REVERSED') {
          // One reversal per transaction (unique index) => a duplicate reversal cannot be processed twice.
          await db.offrampReversal.create({
            data: {
              offrampTransactionId: tx.id,
              providerEventId: opts.reversal?.providerEventId ?? opts.eventKey ?? null,
              amount: opts.reversal?.amount ?? (received && toUnits(received) > 0n ? received : (expected ?? '0')),
              reason: opts.reversal?.reason ?? opts.reason ?? null,
              originalStatus: from ?? tx.status,
            },
          });
        }

        const stellarTxHash = opts.txHash ?? po?.depositTxHash ?? null;
        const rec = {
          reference: tx.reference,
          externalReference: opts.providerOrderId ?? po?.providerOrderId ?? po?.reference ?? null,
          stellarTxHash,
          asset: 'USDC',
          amount: expected ?? '0',
          expectedSettlement: expected ?? '0',
          actualSettlement: received ?? '0',
          outstandingAmount: settlement.outstanding,
          status: target,
          failureReason: reason,
          failureDetail: (opts.detail as any) ?? undefined,
          result: reconciliationResult(target, settlement),
          ...(target === 'COMPLETED' || target === 'REVERSED' ? { settledAt: now } : {}),
        };
        await db.offrampReconciliation.upsert({
          where: { offrampTransactionId: tx.id },
          create: { offrampTransactionId: tx.id, ...rec },
          update: rec,
        });
      });
    } catch (e) {
      if (e instanceof ConflictError) {
        this.logger.warn(`[offramp-state] ${e.message}`);
        return { ...base, outcome: 'CONFLICT', steps: [] };
      }
      if (isUniqueViolation(e)) {
        await this.log(tx, 'duplicate_event_ignored', {
          old: tx.status,
          new: target,
          description: `Duplicate ${target === 'REVERSED' ? 'reversal' : 'event'} ignored`,
          metadata: { actor, eventKey: opts.eventKey ?? null, target: (e as any)?.meta?.target ?? null },
        });
        return { ...base, outcome: 'DUPLICATE', steps: [] };
      }
      throw e;
    }

    return { ...base, outcome: 'APPLIED', steps };
  }

  /**
   * Start the payout, gated on available (simulated) liquidity. When liquidity is below the payout the
   * transaction is held as INSUFFICIENT_LIQUIDITY with the shortfall recorded; it can be retried later.
   */
  async beginPayout(transactionId: string, opts: ApplyOptions = {}): Promise<ApplyResult> {
    const tx = await this.prisma.offrampTransaction.findUnique({
      where: { id: transactionId },
      include: { providerOrder: true },
    });
    if (!tx) return { outcome: 'NOT_FOUND', to: 'PAYOUT_PENDING', steps: [] };
    const available = this.availableLiquidity();
    const required = tx.providerOrder?.expectedAmount;
    if (available !== undefined && required != null) {
      const check = checkLiquidity(required.toString(), available);
      if (!check.ok) {
        const res = await this.apply(transactionId, 'INSUFFICIENT_LIQUIDITY', {
          ...opts,
          reason: 'insufficient_liquidity',
          detail: { required: check.required, available: check.available, shortfall: check.shortfall },
        });
        return { ...res, liquidity: check };
      }
    }
    return this.apply(transactionId, 'PAYOUT_PENDING', opts);
  }

  // -------------------------------------------------------------------------
  // Read side: status view, history, reconciliation records
  // -------------------------------------------------------------------------

  /** Everything the transaction detail view needs, assembled from persisted state only. */
  async getView(reference: string, userId?: string) {
    const tx = await this.prisma.offrampTransaction.findUnique({
      where: { reference },
      include: { providerOrder: true, reconciliation: true, reversal: true },
    });
    if (!tx || (userId && tx.userId !== userId)) return null;

    const logs = await this.prisma.transactionLog.findMany({
      where: { transactionType: 'offramp', transactionId: tx.id },
      orderBy: { createdAt: 'asc' },
    });
    const state = normalizeStatus(tx.status);
    const description = describeState(tx.status);
    const po = tx.providerOrder;
    const settlement = computeSettlement(po?.expectedAmount?.toString() ?? '0', po?.receivedAmount?.toString() ?? '0');
    const fiat = tx.fiatAmount != null ? Number(tx.fiatAmount) : null;
    const expectedUsdc = po?.expectedAmount != null ? Number(po.expectedAmount) : null;

    return {
      reference: tx.reference,
      internalId: tx.id,
      status: state ?? tx.status,
      rawStatus: tx.status,
      statusLabel: description.label,
      statusMessage: description.message,
      successful: description.successful,
      sourceAsset: 'USDC',
      depositAmount: settlement.expected,
      expectedPayout: { amount: tx.fiatAmount?.toString() ?? null, currency: tx.currency },
      actualPayout: { amount: tx.settledFiatAmount?.toString() ?? null, currency: tx.currency },
      conversion: fiat !== null && expectedUsdc ? { rate: Math.round((fiat / expectedUsdc) * 100) / 100, from: 'USDC', to: tx.currency } : null,
      settlement,
      failureReason: po?.failureReason ?? null,
      failureDetail: (po?.failureDetail as Record<string, unknown> | null) ?? null,
      stellarTxHash: po?.depositTxHash ?? null,
      reversal: tx.reversal
        ? { amount: tx.reversal.amount.toString(), reason: tx.reversal.reason, at: tx.reversal.createdAt, originalStatus: tx.reversal.originalStatus, providerEventId: tx.reversal.providerEventId }
        : null,
      timestamps: { createdAt: tx.createdAt, updatedAt: tx.updatedAt, completedAt: tx.completedAt },
      statusHistory: logs
        .filter((l) => l.action === 'status_transition')
        .map((l) => ({
          from: l.oldStatus,
          to: l.newStatus,
          at: l.createdAt,
          reason: l.description,
          actor: (l.metadata as any)?.actor ?? null,
          inferred: !!(l.metadata as any)?.synthetic,
        })),
      auditLog: logs
        .filter((l) => l.action !== 'status_transition')
        .map((l) => ({ action: l.action, at: l.createdAt, from: l.oldStatus, to: l.newStatus, description: l.description })),
      reconciliation: tx.reconciliation ? this.presentReconciliation(tx.reconciliation) : null,
    };
  }

  async getReconciliation(reference: string, userId?: string) {
    const rec = await this.prisma.offrampReconciliation.findUnique({
      where: { reference },
      include: { offrampTransaction: { select: { userId: true } } } as any,
    });
    if (!rec) return null;
    if (userId && (rec as any).offrampTransaction?.userId !== userId) return null;
    return this.presentReconciliation(rec);
  }

  async listReconciliations(filter: { userId?: string; status?: string; result?: string; limit?: number; skip?: number } = {}) {
    const where: Record<string, unknown> = {};
    if (filter.status) where.status = filter.status;
    if (filter.result) where.result = filter.result;
    if (filter.userId) where.offrampTransaction = { userId: filter.userId };
    const rows = await this.prisma.offrampReconciliation.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      skip: filter.skip ?? 0,
    });
    return rows.map((r) => this.presentReconciliation(r));
  }

  private presentReconciliation(r: any) {
    return {
      internalTransactionId: r.offrampTransactionId,
      externalReference: r.externalReference ?? r.reference,
      reference: r.reference,
      stellarTxHash: r.stellarTxHash,
      asset: r.asset,
      amount: r.amount?.toString(),
      expectedSettlement: r.expectedSettlement?.toString(),
      actualSettlement: r.actualSettlement?.toString(),
      outstandingAmount: r.outstandingAmount?.toString(),
      status: r.status,
      failureReason: r.failureReason,
      failureDetail: r.failureDetail ?? null,
      reconciliationResult: r.result,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      settledAt: r.settledAt ?? null,
    };
  }

  private async log(
    tx: { id: string; userId: string },
    action: string,
    f: { old?: string | null; new?: string | null; description?: string; metadata?: Record<string, unknown> },
  ) {
    try {
      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'offramp',
          transactionId: tx.id,
          userId: tx.userId,
          action,
          oldStatus: f.old ?? null,
          newStatus: f.new ?? null,
          description: f.description,
          metadata: (f.metadata as any) ?? undefined,
        },
      });
    } catch (e) {
      this.logger.error(`[offramp-state] failed to write ${action} log: ${(e as Error).message}`);
    }
  }
}
