import { createHmac, timingSafeEqual } from 'crypto';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BitNobService } from './bitnob.service';
import { SwapGateway } from '../swap/swap.gateway';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { OfframpStateService } from '../ramp/offramp-state.service';
import { OfframpState, computeSettlement } from '../ramp/offramp-state-machine';

type MappedStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'PARTIAL'
  | 'REVERSED';

export function verifyBitnobSignature(
  rawBody: Buffer | string | undefined | null,
  signature: string | undefined | null,
  secret: string | undefined | null,
): boolean {
  if (!rawBody || !signature || !secret) return false;
  const provided = signature.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(provided)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export function mapBitnobEvent(
  event?: string | null,
  fallbackStatus?: string | null,
): MappedStatus | null {
  const normalized = (event || fallbackStatus || '').trim().toLowerCase();
  if (!normalized) return null;
  const key = normalized
    .replace(/^payouts?\./, '')
    .replace(/^withdrawal\./, '')
    .replace(/^transfer\./, '');

  const statusMap: Record<string, MappedStatus> = {
    created: 'PENDING',
    quoted: 'PENDING',
    initialized: 'PENDING',
    pending: 'PROCESSING',
    transaction_started: 'PROCESSING',
    processing: 'PROCESSING',
    deposited: 'PROCESSING',
    settled: 'COMPLETED',
    success: 'COMPLETED',
    completed: 'COMPLETED',
    paid: 'COMPLETED',
    failed: 'FAILED',
    expired: 'EXPIRED',
    cancelled: 'CANCELLED',
    canceled: 'CANCELLED',
    refunded: 'REFUNDED',
    reversed: 'REVERSED',
    reversal: 'REVERSED',
    reverse: 'REVERSED',
  };

  return statusMap[key] || null;
}

/** Map a (reclassified) provider status onto the off-ramp state machine. */
function toOfframpTarget(
  status: MappedStatus,
  failureReason: string | null,
): OfframpState | null {
  switch (status) {
    case 'PENDING':
      return 'AWAITING_DEPOSIT';
    case 'PROCESSING':
      return 'PROCESSING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'PARTIAL':
      return 'PARTIALLY_SETTLED';
    case 'REVERSED':
    case 'REFUNDED':
      return 'REVERSED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'REJECTED':
      return failureReason === 'insufficient_liquidity'
        ? 'INSUFFICIENT_LIQUIDITY'
        : 'REJECTED';
    case 'FAILED':
    case 'CANCELLED':
      return 'FAILED';
    default:
      return null;
  }
}

function isTerminal(status: string): boolean {
  return [
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'REFUNDED',
    'REJECTED',
    'EXPIRED',
    'PARTIAL',
    'REVERSED',
  ].includes(status);
}

function statusRank(status: string): number {
  const ranks: Record<string, number> = {
    PENDING: 1,
    PROCESSING: 2,
    COMPLETED: 3,
    REFUNDED: 3,
    FAILED: 3,
    CANCELLED: 3,
    REJECTED: 3,
    EXPIRED: 3,
    PARTIAL: 3,
    REVERSED: 3,
  };
  return ranks[status] ?? 0;
}

function deepFind(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) return v;
    if (v && typeof v === 'object') {
      const found = deepFind(v, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Normalize a numeric/string/Decimal amount to a safe decimal string, or null. */
function safeDecimal(value: unknown): string | null {
  if (value == null) return null;
  let raw: string | null = null;
  if (typeof value === 'string') {
    raw = value;
  } else if (typeof value === 'number') {
    raw = Number.isFinite(value) ? String(value) : null;
  } else if (
    typeof value === 'object' &&
    typeof (value as { toString?: unknown })?.toString === 'function'
  ) {
    raw = (value as { toString(): string }).toString();
  }
  if (raw == null) return null;
  const s = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

/** Extract the USDC amount actually received on a payout deposit event. */
function extractReceivedAmount(data: any): string | null {
  return safeDecimal(
    deepFind(data, [
      'received_amount',
      'amount_received',
      'deposit_amount',
      'settled_amount',
      'crypto_amount',
      'amount',
    ]),
  );
}

/** Extract the Stellar transaction hash of the funding deposit, when present. */
function extractTxHash(data: any): string | null {
  const v = deepFind(data, [
    'transaction_hash',
    'tx_hash',
    'stellar_tx_hash',
    'txid',
    'tx_id',
    'hash',
  ]);
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Resolve a normalized failure reason from a terminal provider event.
 * `data` may carry a provider message/status explaining WHY the payout ended.
 */
function resolveFailureReason(
  status: MappedStatus,
  event: string,
  data: any,
): string | null {
  if (status === 'REVERSED') return 'reversal';
  if (status === 'PARTIAL') return 'partial_settlement';

  const haystack = [
    event,
    ...['message', 'reason', 'status', 'error', 'narration', 'detail'].map(
      (k) => {
        const v = deepFind(data, [k]);
        return v == null ? '' : String(v);
      },
    ),
  ]
    .join(' ')
    .toLowerCase();

  if (
    /liquidity|insufficient[ _-]?funds?|insufficient[ _-]?balance/.test(
      haystack,
    )
  ) {
    return 'insufficient_liquidity';
  }
  if (status === 'FAILED' && /reject|declined|refused/.test(haystack)) {
    return 'rejected';
  }
  return null;
}

@Injectable()
export class BitNobWebhookService {
  private readonly logger = new Logger(BitNobWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitnobService: BitNobService,
    @Inject(forwardRef(() => SwapGateway))
    private readonly swapGateway: SwapGateway,
    private readonly notificationsService: NotificationsService,
    private readonly offrampState: OfframpStateService,
  ) {}

  async processWebhook(raw: Record<string, any>) {
    this.logger.log(`Received Bitnob webhook: ${JSON.stringify(raw)}`);
    const event =
      raw?.event ||
      raw?.eventType ||
      raw?.data?.event ||
      raw?.data?.event_type ||
      '';

    try {
      if (event.toLowerCase().startsWith('payout')) {
        return this.handlePayoutWebhook(raw.data || raw, event);
      }
      if (
        event.toLowerCase().startsWith('transfer') ||
        event.toLowerCase().startsWith('withdrawal')
      ) {
        return this.handleWithdrawalWebhook(raw.data || raw, event);
      }
      if (
        event.toLowerCase().includes('deposit') ||
        raw?.data?.virtual_account_id ||
        raw?.payload?.virtual_account_id
      ) {
        return this.handleDepositWebhook(raw);
      }

      this.logger.warn(`Bitnob webhook ignored: event=${event}`);
      return { status: 'ignored', reason: 'unknown_event', event };
    } catch (error) {
      this.logger.error(
        `Bitnob webhook error: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  private async handlePayoutWebhook(data: any, event: string) {
    const payoutId = data?.id || data?.payout_id || data?.data?.id;
    const reference = data?.reference || data?.data?.reference;
    const providerOrder = await this.findProviderOrder(payoutId, reference);
    if (!providerOrder) {
      this.logger.warn(
        `Bitnob payout webhook for unknown order: ${payoutId || reference}`,
      );
      return { status: 'ignored', reason: 'unknown_order' };
    }

    const { transaction, isMerchant } = await this.loadParent(providerOrder);
    if (!transaction) {
      throw new NotFoundException(
        `Parent transaction not found for ${providerOrder.reference}`,
      );
    }

    const mapped = mapBitnobEvent(event, data.status);

    // D1: user off-ramps go through the state machine (validated, idempotent, fully logged).
    // Merchant off-ramps keep the legacy path below.
    if (!isMerchant && mapped) {
      return this.handleUserPayoutEvent({
        transaction,
        providerOrder,
        event,
        data,
        payoutId,
        mapped,
      });
    }

    if (
      mapped &&
      (!isTerminal(transaction.status) ||
        statusRank(mapped) >= statusRank(transaction.status))
    ) {
      let finalStatus: MappedStatus = mapped;
      let failureReason: string | null = resolveFailureReason(
        mapped,
        event,
        data,
      );

      // Reclassify provider failures that carry a clear reason as REJECTED.
      if (
        mapped === 'FAILED' &&
        (failureReason === 'insufficient_liquidity' ||
          failureReason === 'rejected')
      ) {
        finalStatus = 'REJECTED';
      }

      // Detect under-payment on the deposit transition (partial settlement).
      const receivedRaw = extractReceivedAmount(data);
      const depositTxHash = extractTxHash(data);
      if (receivedRaw != null && mapped === 'PROCESSING') {
        const received = Number(receivedRaw);
        const expectedRaw =
          providerOrder.expectedAmount != null
            ? safeDecimal(providerOrder.expectedAmount)
            : null;
        const expected = expectedRaw != null ? Number(expectedRaw) : null;
        if (
          Number.isFinite(received) &&
          expected != null &&
          Number.isFinite(expected) &&
          received < expected
        ) {
          finalStatus = 'PARTIAL';
          failureReason = 'partial_settlement';
        }
      }

      const updateData: any = { status: finalStatus };
      if (finalStatus === 'COMPLETED') updateData.completedAt = new Date();
      updateData.metadata = {
        ...((transaction.metadata as Record<string, any>) || {}),
        bitnob: { event, payoutId, data },
      };

      const updated = isMerchant
        ? await this.prisma.merchantOfframpTransaction.update({
            where: { id: transaction.id },
            data: updateData,
          })
        : await this.prisma.offrampTransaction.update({
            where: { id: transaction.id },
            data: updateData,
          });

      await this.prisma.offrampProviderOrder.update({
        where: { id: providerOrder.id },
        data: {
          providerStatus: event,
          providerOrderId: payoutId || providerOrder.providerOrderId,
          ...(receivedRaw != null ? { receivedAmount: receivedRaw } : {}),
          ...(failureReason ? { failureReason } : {}),
          ...(depositTxHash ? { depositTxHash } : {}),
        },
      });

      this.emitUpdate(
        updated.reference,
        'offramp',
        finalStatus,
        updated.id,
        isMerchant,
      );
      await this.logWebhook(
        'offramp',
        updated.id,
        updated.reference,
        event,
        finalStatus,
        data,
      );
      if (isMerchant)
        await this.notifySafely((transaction as any).merchantId, updated);
      else await this.mirrorMerchantOfframp(updated, finalStatus);
      return {
        status: 'processed',
        reference: updated.reference,
        newStatus: finalStatus,
      };
    }

    return { status: 'ignored', reason: 'no_status_change', event };
  }

  /** Apply a provider payout event to a user off-ramp through the state machine. */
  private async handleUserPayoutEvent(args: {
    transaction: any;
    providerOrder: any;
    event: string;
    data: any;
    payoutId?: string;
    mapped: MappedStatus;
  }) {
    const { transaction, providerOrder, event, data, payoutId, mapped } = args;

    let failureReason: string | null = resolveFailureReason(mapped, event, data);
    let finalStatus: MappedStatus = mapped;
    if (
      mapped === 'FAILED' &&
      (failureReason === 'insufficient_liquidity' || failureReason === 'rejected')
    ) {
      finalStatus = 'REJECTED';
    }

    // Under-payment on the deposit transition => partial settlement.
    const receivedRaw = extractReceivedAmount(data);
    const depositTxHash = extractTxHash(data);
    if (
      receivedRaw != null &&
      mapped === 'PROCESSING' &&
      providerOrder.expectedAmount != null &&
      computeSettlement(providerOrder.expectedAmount.toString(), receivedRaw).kind === 'PARTIAL'
    ) {
      finalStatus = 'PARTIAL';
      failureReason = 'partial_settlement';
    }

    const target = toOfframpTarget(finalStatus, failureReason);
    if (!target) return { status: 'ignored', reason: 'unmapped_status', event };

    // Same provider event + status + amount => same key => applied at most once.
    const eventKey = [
      'bitnob',
      payoutId || providerOrder.reference,
      event,
      data?.status ?? '',
      receivedRaw ?? '',
    ].join(':');

    const result = await this.offrampState.apply(transaction.id, target, {
      actor: 'bitnob-webhook',
      eventKey,
      eventType: event,
      payload: data,
      providerStatus: event,
      providerOrderId: payoutId || undefined,
      receivedAmount: receivedRaw,
      txHash: depositTxHash,
      reason: failureReason,
      detail: failureReason ? { providerEvent: event, providerResponse: data } : undefined,
      settledFiatAmount:
        target === 'COMPLETED' && transaction.fiatAmount != null
          ? transaction.fiatAmount.toString()
          : undefined,
    });

    if (result.outcome !== 'APPLIED') {
      const reason =
        result.outcome === 'DUPLICATE'
          ? 'duplicate_event'
          : result.outcome === 'REJECTED_TRANSITION'
            ? 'invalid_transition'
            : 'no_status_change';
      this.logger.warn(`Bitnob payout event ${event} for ${providerOrder.reference} ignored: ${reason}`);
      return { status: 'ignored', reason, event };
    }

    // With a simulated liquidity limit configured, gate the payout on it once processing starts.
    if (target === 'PROCESSING' && this.offrampState.availableLiquidity() !== undefined) {
      await this.offrampState.beginPayout(transaction.id, { actor: 'payout-gate' });
    }

    const updated = await this.prisma.offrampTransaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          ...((transaction.metadata as Record<string, any>) || {}),
          bitnob: { event, payoutId, data },
        },
      },
    });
    this.emitUpdate(updated.reference, 'offramp', updated.status, updated.id, false);
    await this.logWebhook('offramp', updated.id, updated.reference, event, updated.status, data);
    await this.mirrorMerchantOfframp(updated, updated.status);
    return { status: 'processed', reference: updated.reference, newStatus: updated.status };
  }

  private async handleWithdrawalWebhook(data: any, event: string) {
    const ref =
      data?.reference || data?.data?.reference || data?.client_reference || '';
    const reference = String(ref).replace(/^WDR_/, '');
    const status = mapBitnobEvent(event, data.status || data?.data?.status);
    if (!status) {
      return { status: 'ignored', reason: 'unknown_status', event };
    }

    const tx = await this.prisma.onrampTransaction.findUnique({
      where: { reference },
    });
    if (!tx) {
      this.logger.warn(
        `Bitnob withdrawal webhook for unknown reference: ${reference}`,
      );
      return { status: 'ignored', reason: 'unknown_reference' };
    }

    if (statusRank(status) < statusRank(tx.status) || isTerminal(tx.status)) {
      return { status: 'ignored', reason: 'no_status_change', event };
    }

    const updateData: any = {
      status,
      metadata: {
        ...((tx.metadata as Record<string, any>) || {}),
        bitnob: { event, data },
      },
    };
    if (status === 'COMPLETED') updateData.completedAt = new Date();

    const updated = await this.prisma.onrampTransaction.update({
      where: { id: tx.id },
      data: updateData,
    });

    this.emitUpdate(updated.reference, 'onramp', status, updated.id, false);
    await this.logWebhook(
      'onramp',
      updated.id,
      updated.reference,
      event,
      status,
      data,
    );
    return {
      status: 'processed',
      reference: updated.reference,
      newStatus: status,
    };
  }

  private async handleDepositWebhook(raw: Record<string, any>) {
    const payload = raw?.data || raw?.payload || raw;
    const vaId = payload?.virtual_account_id || payload?.virtualAccountId;
    if (!vaId) {
      return { status: 'ignored', reason: 'missing_virtual_account_id' };
    }

    const va = await this.prisma.virtualAccount.findFirst({
      where: { externalReference: String(vaId) },
    });
    if (!va) {
      this.logger.warn(`Bitnob deposit webhook for unknown VA: ${vaId}`);
      return { status: 'ignored', reason: 'unknown_virtual_account' };
    }

    if (va.transactionType !== 'onramp') {
      return { status: 'ignored', reason: 'not_onramp_va' };
    }

    const tx = await this.findPendingOnrampForVa(va);
    if (!tx) {
      throw new NotFoundException(
        `Onramp transaction not found for VA ${vaId}`,
      );
    }

    if (tx.status !== 'PENDING') {
      return {
        status: 'ignored',
        reason: 'not_pending',
        currentStatus: tx.status,
      };
    }

    try {
      await this.prisma.onrampTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'PROCESSING',
          metadata: {
            ...((tx.metadata as Record<string, any>) || {}),
            bitnobDeposit: payload,
          },
        },
      });

      await this.runOnrampPipeline(tx, payload);
      return { status: 'processed', reference: tx.reference };
    } catch (error) {
      this.logger.error(`Onramp pipeline failed: ${(error as Error).message}`);
      await this.prisma.onrampTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...((tx.metadata as Record<string, any>) || {}),
            bitnobDeposit: payload,
            failureReason: (error as Error).message,
          },
        },
      });
      this.emitUpdate(tx.reference, 'onramp', 'FAILED', tx.id, false);
      throw error;
    }
  }

  private async runOnrampPipeline(tx: any, payload: any) {
    const amountKobo = Number(payload?.amount || payload?.settled_amount || 0);
    const naira = amountKobo / 100;
    this.logger.log(`Onramp pipeline for ${tx.reference}: naira=${naira}`);

    if (naira < 500 || naira > 10_000_000) {
      throw new Error(
        `Deposit amount ${naira} NGN outside Bitnob trading bounds`,
      );
    }

    const quote = await this.bitnobService.tradingQuote({
      baseCurrency: 'NGN',
      quoteCurrency: 'USDC',
      side: 'sell',
      quantity: naira,
    });

    const quoteId = quote?.data?.id || quote?.id;
    const price = quote?.data?.price || quote?.price;
    if (!quoteId || !price) {
      throw new Error('Bitnob trading quote missing id/price');
    }

    const order = await this.bitnobService.tradingOrder({
      baseCurrency: 'NGN',
      quoteCurrency: 'USDC',
      side: 'sell',
      quantity: naira,
      price,
      quoteId,
      reference: `TRD_${tx.reference}`,
    });

    const receive =
      order?.data?.exchange?.receive_quantity ||
      order?.exchange?.receive_quantity ||
      order?.data?.receive_quantity ||
      order?.receive_quantity;
    if (!receive) {
      throw new Error('Bitnob trading order missing receive_quantity');
    }

    const receiveTokens = Number(receive);
    const usdcAmount = Math.floor(receiveTokens - 1_000_000);
    if (usdcAmount <= 1_010_000) {
      throw new Error(`USDC after $1 fee too small: ${usdcAmount}`);
    }

    const withdrawal = await this.bitnobService.createWithdrawal({
      toAddress: tx.destinationAddress,
      amount: usdcAmount,
      reference: `WDR_${tx.reference}`,
      memo: '',
      description: `Onramp settlement for ${tx.reference}`,
    });

    await this.prisma.onrampTransaction.update({
      where: { id: tx.id },
      data: {
        metadata: {
          ...(tx.metadata || {}),
          bitnobTradingQuote: quote,
          bitnobTradingOrder: order,
          bitnobWithdrawal: withdrawal,
        },
      },
    });

    this.emitUpdate(tx.reference, 'onramp', 'PROCESSING', tx.id, false);
    this.logger.log(`Onramp withdrawal created for ${tx.reference}`);
  }

  private async findPendingOnrampForVa(va: any) {
    if (va.userId) {
      return this.prisma.onrampTransaction.findFirst({
        where: { userId: va.userId, network: 'stellar', status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (va.merchantId) {
      return this.prisma.merchantOnrampTransaction.findFirst({
        where: {
          merchantId: va.merchantId,
          network: 'stellar',
          status: 'PENDING',
        },
        orderBy: { createdAt: 'asc' },
      });
    }
    return null;
  }

  private async findProviderOrder(payoutId?: string, reference?: string) {
    if (payoutId) {
      const byId = await this.prisma.offrampProviderOrder.findFirst({
        where: { providerOrderId: String(payoutId) },
      });
      if (byId) return byId;
    }
    if (reference) {
      return this.prisma.offrampProviderOrder.findUnique({
        where: { reference },
      });
    }
    return null;
  }

  private async loadParent(providerOrder: any) {
    if (providerOrder.merchantOfframpTransactionId) {
      const tx = await this.prisma.merchantOfframpTransaction.findUnique({
        where: { id: providerOrder.merchantOfframpTransactionId },
      });
      return { transaction: tx, isMerchant: true };
    }
    if (providerOrder.offrampTransactionId) {
      const tx = await this.prisma.offrampTransaction.findUnique({
        where: { id: providerOrder.offrampTransactionId },
      });
      return { transaction: tx, isMerchant: false };
    }
    return { transaction: null, isMerchant: false };
  }

  private async mirrorMerchantOfframp(userTransaction: any, status: string) {
    try {
      const merchantTx =
        await this.prisma.merchantOfframpTransaction.findUnique({
          where: { reference: userTransaction.reference },
        });
      if (!merchantTx || merchantTx.status === status) return;
      await this.prisma.merchantOfframpTransaction.update({
        where: { id: merchantTx.id },
        data: {
          status: status as any,
          completedAt: status === 'COMPLETED' ? new Date() : undefined,
        },
      });
      await this.notifySafely(merchantTx.merchantId, { ...merchantTx, status });
    } catch (error) {
      this.logger.error(
        `Mirror merchant offramp failed: ${(error as Error).message}`,
      );
    }
  }

  private async notifySafely(merchantId: string | undefined, transaction: any) {
    if (!merchantId) return;
    try {
      await this.notificationsService.notifyMerchant(
        merchantId,
        'offramp.updated',
        transaction,
      );
    } catch (error) {
      this.logger.error(`Notify merchant failed: ${(error as Error).message}`);
    }
  }

  private emitUpdate(
    reference: string,
    type: 'onramp' | 'offramp',
    status: string,
    id: string,
    isMerchant: boolean,
  ) {
    if (!this.swapGateway) return;
    this.swapGateway.emitTransactionUpdate(reference, {
      type,
      status,
      [`${type}Id`]: id,
      isMerchant,
    });
  }

  private async logWebhook(
    transactionType: 'onramp' | 'offramp',
    transactionId: string,
    reference: string,
    event: string,
    status: string,
    payload: any,
  ) {
    await this.prisma.webhookEvent.create({
      data: {
        transactionType,
        transactionId,
        reference,
        eventType: event,
        status,
        provider: 'bitnob',
        payload,
        processed: true,
        processedAt: new Date(),
      },
    });
    await this.prisma.transactionLog.create({
      data: {
        transactionType,
        transactionId,
        action: 'status_changed',
        newStatus: status,
        description: `Bitnob webhook: ${event}`,
        metadata: payload,
      },
    });
  }
}
