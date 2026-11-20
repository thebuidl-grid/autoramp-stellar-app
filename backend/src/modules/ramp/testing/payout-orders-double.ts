/**
 * Test double for PayoutOrderRepository that delegates to a spec's own `prisma.offrampProviderOrder` mock, so specs that
 * exercise a caller's logic (webhooks, expiry, bridge, relay, ...) keep asserting on the order rows they already build.
 * The repository itself (legs mapping, dual write) is covered by payout-order.repository.spec.ts.
 */
export function payoutOrdersOver(prisma: any): any {
  const po = () => prisma.offrampProviderOrder;
  return {
    findByReference: (reference: string) =>
      po().findUnique({ where: { reference } }),
    findByProviderOrderId: (providerOrderId: string) =>
      po().findFirst({ where: { providerOrderId: String(providerOrderId) } }),
    findByTransactionId: (id: string) =>
      po().findFirst({
        where: {
          OR: [
            { offrampTransactionId: id },
            { merchantOfframpTransactionId: id },
          ],
        },
      }),
    attach: async (tx: any) => {
      if (!tx) return null;
      if ('providerOrder' in tx) return tx;
      // Fakes that model the relation expose it through `include`.
      const withOrder = await prisma.offrampTransaction?.findUnique?.({
        where: { id: tx.id },
        include: { providerOrder: true },
      });
      return { ...tx, providerOrder: withOrder?.providerOrder ?? null };
    },
    attachMany: async (txs: any[]) =>
      txs.map((tx) =>
        'providerOrder' in tx ? tx : { ...tx, providerOrder: null },
      ),
    // Mirrors the old sweep query's shape so specs can assert which bridge statuses the sweep may expire.
    findExpirable: (now: Date, cutoff: Date, statuses: string[]) =>
      po().findMany({
        where: {
          provider: 'bitnob',
          AND: [
            {
              OR: [
                { expiresAt: { lt: now } },
                { expiresAt: null, createdAt: { lt: cutoff } },
              ],
            },
            {
              OR: [
                { bridgeReference: null },
                { bridgeStatus: { in: statuses } },
              ],
            },
          ],
        },
      }),
    create: (input: any) =>
      po().create({
        data: {
          reference: input.reference,
          provider: 'bitnob',
          providerOrderId: input.providerOrderId ?? null,
          sourceAddress: input.sourceAddress ?? null,
          offrampTransactionId: input.isMerchant ? null : input.transactionId,
          merchantOfframpTransactionId: input.isMerchant
            ? input.transactionId
            : null,
          fundingAddress: input.fundingAddress ?? null,
          expectedAmount: input.expectedAmount ?? null,
          memo: input.memo ?? null,
          expiresAt: input.expiresAt ?? null,
        },
      }),
    update: (order: any, patch: any) =>
      po().update({ where: { id: order.id }, data: patch }),
  };
}
