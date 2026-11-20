import { Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * The single place that reads and writes an off-ramp's payout order.
 *
 * It replaces direct use of the `offramp_provider_orders` table. The data now lives on provider legs
 * (`transaction_providers`): a BITNOB/PAYOUT leg and, when funding came over the bridge, a CCTP/BRIDGE leg. Callers still
 * see one `PayoutOrder` with the field names the old table had, so the off-ramp code does not need to know about legs.
 *
 * offramp_provider_orders is no longer written by this code; a database trigger on it still mirrors any write by an older
 * release into the legs. Drop the table and the trigger in a later migration once no older release is running.
 */

/** Same shape as the old `offramp_provider_orders` row, plus nothing else. `id` is the payout leg's id. */
export interface PayoutOrder {
  id: string;
  reference: string;
  provider: string;
  providerOrderId: string | null;
  providerStatus: string | null;
  sourceAddress: string | null;
  offrampTransactionId: string | null;
  merchantOfframpTransactionId: string | null;
  fundingAddress: string | null;
  expectedAmount: any;
  receivedAmount: any;
  outstandingAmount: any;
  memo: string | null;
  expiresAt: Date | null;
  failureReason: string | null;
  failureDetail: any;
  depositTxHash: string | null;
  paymentReference: string | null;
  bridgeReference: string | null;
  bridgeStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields a caller may change. Names match the old table. Bridge fields go to the CCTP leg, the rest to the payout leg. */
export interface PayoutOrderPatch {
  providerOrderId?: string | null;
  providerStatus?: string | null;
  sourceAddress?: string | null;
  fundingAddress?: string | null;
  expectedAmount?: any;
  receivedAmount?: any;
  outstandingAmount?: any;
  memo?: string | null;
  expiresAt?: Date | null;
  failureReason?: string | null;
  failureDetail?: any;
  depositTxHash?: string | null;
  paymentReference?: string | null;
  bridgeReference?: string | null;
  bridgeStatus?: string | null;
}

export interface CreatePayoutOrderInput {
  reference: string;
  /** The off-ramp transaction (user) or merchant off-ramp transaction this order belongs to. */
  transactionId: string;
  isMerchant: boolean;
  providerOrderId?: string | null;
  sourceAddress?: string | null;
  fundingAddress?: string | null;
  expectedAmount?: any;
  memo?: string | null;
  expiresAt?: Date | null;
}

/** Prisma client or an interactive-transaction client; only the delegates used here are needed. */
type Db = any;

const PAYOUT = { role: 'PAYOUT', provider: 'BITNOB' } as const;
const BRIDGE = { role: 'BRIDGE', provider: 'CCTP' } as const;

/** Patch keys that live on the payout leg, mapped to the leg's column name. */
const PAYOUT_FIELDS: Record<string, string> = {
  providerOrderId: 'providerReference',
  providerStatus: 'status',
  sourceAddress: 'sourceAddress',
  fundingAddress: 'fundingAddress',
  expectedAmount: 'expectedAmount',
  receivedAmount: 'receivedAmount',
  outstandingAmount: 'outstandingAmount',
  memo: 'memo',
  expiresAt: 'expiresAt',
  failureReason: 'failureReason',
  failureDetail: 'failureDetail',
  depositTxHash: 'depositTxHash',
  paymentReference: 'paymentReference',
};

/** Pure mapping from legs to the old order shape (exported for tests). */
export function toPayoutOrder(payout: any, bridge: any | null): PayoutOrder {
  const merchant = payout.scope === 'MERCHANT';
  return {
    id: payout.id,
    reference: payout.reference,
    provider: 'bitnob',
    providerOrderId: payout.providerReference ?? null,
    providerStatus: payout.status ?? null,
    sourceAddress: payout.sourceAddress ?? null,
    offrampTransactionId: merchant ? null : payout.transactionId,
    merchantOfframpTransactionId: merchant ? payout.transactionId : null,
    fundingAddress: payout.fundingAddress ?? null,
    expectedAmount: payout.expectedAmount ?? null,
    receivedAmount: payout.receivedAmount ?? null,
    outstandingAmount: payout.outstandingAmount ?? null,
    memo: payout.memo ?? null,
    expiresAt: payout.expiresAt ?? null,
    failureReason: payout.failureReason ?? null,
    failureDetail: payout.failureDetail ?? null,
    depositTxHash: payout.depositTxHash ?? bridge?.depositTxHash ?? null,
    paymentReference: payout.paymentReference ?? null,
    bridgeReference: bridge?.providerReference ?? null,
    bridgeStatus: bridge?.status ?? null,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
  };
}

@Injectable()
export class PayoutOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async hydrate(
    db: Db,
    payout: any | null,
  ): Promise<PayoutOrder | null> {
    if (!payout) return null;
    const bridge = await db.transactionLeg.findFirst({
      where: { transactionId: payout.transactionId, ...BRIDGE },
    });
    return toPayoutOrder(payout, bridge);
  }

  findByReference(
    reference: string,
    db: Db = this.prisma,
  ): Promise<PayoutOrder | null> {
    return db.transactionLeg
      .findFirst({ where: { reference, ...PAYOUT } })
      .then((leg: any) => this.hydrate(db, leg));
  }

  findByProviderOrderId(
    providerOrderId: string,
    db: Db = this.prisma,
  ): Promise<PayoutOrder | null> {
    return db.transactionLeg
      .findFirst({
        where: { providerReference: String(providerOrderId), ...PAYOUT },
      })
      .then((leg: any) => this.hydrate(db, leg));
  }

  findByTransactionId(
    transactionId: string,
    db: Db = this.prisma,
  ): Promise<PayoutOrder | null> {
    return db.transactionLeg
      .findFirst({ where: { transactionId, ...PAYOUT } })
      .then((leg: any) => this.hydrate(db, leg));
  }

  /** Returns the transaction with `providerOrder` filled in, as `include: { providerOrder: true }` used to. */
  async attach<T extends { id: string }>(
    tx: T | null,
    db: Db = this.prisma,
  ): Promise<(T & { providerOrder: PayoutOrder | null }) | null> {
    if (!tx) return null;
    return { ...tx, providerOrder: await this.findByTransactionId(tx.id, db) };
  }

  /** Same as `attach` for a list, in two queries (payout legs, bridge legs) however many transactions there are. */
  async attachMany<T extends { id: string }>(
    txs: T[],
    db: Db = this.prisma,
  ): Promise<Array<T & { providerOrder: PayoutOrder | null }>> {
    if (!txs.length) return [];
    const ids = txs.map((tx) => tx.id);
    const [payouts, bridges] = await Promise.all([
      db.transactionLeg.findMany({
        where: { transactionId: { in: ids }, ...PAYOUT },
      }),
      db.transactionLeg.findMany({
        where: { transactionId: { in: ids }, ...BRIDGE },
      }),
    ]);
    const bridgeByTx = new Map<string, any>(
      bridges.map((leg: any) => [leg.transactionId, leg]),
    );
    const orderByTx = new Map<string, PayoutOrder>(
      payouts.map((leg: any) => [
        leg.transactionId,
        toPayoutOrder(leg, bridgeByTx.get(leg.transactionId) ?? null),
      ]),
    );
    return txs.map((tx) => ({
      ...tx,
      providerOrder: orderByTx.get(tx.id) ?? null,
    }));
  }

  /**
   * Bitnob payout orders whose funding window has passed (or that are old with no window), and that have no bridge leg or a
   * bridge leg that definitively failed. In-flight and delivered bridge legs are held open, as before.
   */
  async findExpirable(
    now: Date,
    fallbackCutoff: Date,
    expirableBridgeStatuses: string[],
    db: Db = this.prisma,
  ) {
    const payouts = await db.transactionLeg.findMany({
      where: {
        ...PAYOUT,
        OR: [
          { expiresAt: { lt: now } },
          { expiresAt: null, createdAt: { lt: fallbackCutoff } },
        ],
      },
    });
    const out: Array<
      Pick<
        PayoutOrder,
        | 'id'
        | 'reference'
        | 'offrampTransactionId'
        | 'merchantOfframpTransactionId'
      >
    > = [];
    for (const payout of payouts) {
      const bridge = await db.transactionLeg.findFirst({
        where: { transactionId: payout.transactionId, ...BRIDGE },
      });
      if (
        bridge?.providerReference &&
        !expirableBridgeStatuses.includes(bridge.status ?? '')
      )
        continue;
      const order = toPayoutOrder(payout, bridge);
      out.push({
        id: order.id,
        reference: order.reference,
        offrampTransactionId: order.offrampTransactionId,
        merchantOfframpTransactionId: order.merchantOfframpTransactionId,
      });
    }
    return out;
  }

  async create(
    input: CreatePayoutOrderInput,
    db: Db = this.prisma,
  ): Promise<PayoutOrder> {
    const scope = input.isMerchant ? 'MERCHANT' : 'USER';
    const legData = {
      scope,
      reference: input.reference,
      providerReference: input.providerOrderId ?? null,
      sourceAddress: input.sourceAddress ?? null,
      fundingAddress: input.fundingAddress ?? null,
      expectedAmount: input.expectedAmount ?? null,
      memo: input.memo ?? null,
      expiresAt: input.expiresAt ?? null,
      details: { reference: input.reference },
      lastEventAt: new Date(),
    };
    const payout = await db.transactionLeg.upsert({
      where: {
        transactionId_role_provider: {
          transactionId: input.transactionId,
          ...PAYOUT,
        },
      },
      create: { transactionId: input.transactionId, ...PAYOUT, ...legData },
      update: legData,
    });

    return (await this.hydrate(db, payout))!;
  }

  /**
   * Record (or update) the CCTP leg of an off-ramp funded over the relay: the Stellar burn and the Base mint. Same leg a bridge transfer
   * has, so the admin CCTP page and the trace show relayed off-ramps too. Safe to call on every relay change.
   */
  async recordRelayLeg(
    transactionId: string,
    fields: import('./cctp-relay-leg').RelayLegFields,
    db: Db = this.prisma,
  ) {
    const data = {
      scope: 'USER' as const,
      reference: fields.reference,
      providerReference: fields.providerReference,
      status: fields.status,
      depositTxHash: fields.depositTxHash,
      fundingAddress: fields.fundingAddress,
      failedStep: fields.failedStep,
      failureReason: fields.failureReason,
      details: fields.details as any,
      lastEventAt: new Date(),
    };
    return db.transactionLeg.upsert({
      where: { transactionId_role_provider: { transactionId, ...BRIDGE } },
      create: { transactionId, ...BRIDGE, ...data },
      update: data,
    });
  }

  /** Apply `patch` to the order's legs. Returns the updated order. */
  async update(
    order: Pick<
      PayoutOrder,
      | 'id'
      | 'reference'
      | 'offrampTransactionId'
      | 'merchantOfframpTransactionId'
    >,
    patch: PayoutOrderPatch,
    db: Db = this.prisma,
  ): Promise<PayoutOrder> {
    const transactionId = (order.offrampTransactionId ??
      order.merchantOfframpTransactionId)!;
    const scope = order.merchantOfframpTransactionId ? 'MERCHANT' : 'USER';

    const payoutData: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(PAYOUT_FIELDS)) {
      if ((patch as any)[key] !== undefined)
        payoutData[column] = (patch as any)[key];
    }
    let payout: any;
    if (Object.keys(payoutData).length) {
      payout = await db.transactionLeg.update({
        where: { id: order.id },
        data: { ...payoutData, lastEventAt: new Date() },
      });
    } else {
      payout = await db.transactionLeg.findUnique({ where: { id: order.id } });
    }

    if (
      patch.bridgeReference !== undefined ||
      patch.bridgeStatus !== undefined
    ) {
      const bridgeData: Record<string, unknown> = { lastEventAt: new Date() };
      if (patch.bridgeReference !== undefined)
        bridgeData.providerReference = patch.bridgeReference;
      if (patch.bridgeStatus !== undefined)
        bridgeData.status = patch.bridgeStatus;
      if (patch.depositTxHash !== undefined)
        bridgeData.depositTxHash = patch.depositTxHash;
      await db.transactionLeg.upsert({
        where: { transactionId_role_provider: { transactionId, ...BRIDGE } },
        create: {
          transactionId,
          scope,
          reference: order.reference,
          ...BRIDGE,
          ...bridgeData,
        },
        update: bridgeData,
      });
    }

    return (await this.hydrate(db, payout))!;
  }
}

/** Import this module wherever a provider needs the repository (also from modules a standalone worker boots without AppModule). */
@Module({
  providers: [PayoutOrderRepository],
  exports: [PayoutOrderRepository],
})
export class PayoutOrderModule {}
