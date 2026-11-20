import { RampService } from './ramp.service';
import { PayoutOrderRepository } from './payout-order.repository';

/**
 * The transaction history list used to read each off-ramp's payout order through a Prisma relation on offramp_provider_orders.
 * It now reads the provider legs; the response must keep exactly the fields it always had.
 */
function build(offrampRows: any[], legs: any[]) {
  const none = {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const prisma: any = {
    onrampTransaction: none,
    swapTransaction: none,
    merchantOnrampTransaction: none,
    merchantSwapTransaction: none,
    offrampTransaction: {
      count: jest.fn().mockResolvedValue(offrampRows.length),
      findMany: jest.fn().mockResolvedValue(offrampRows),
    },
    merchantOfframpTransaction: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    transactionLeg: {
      findMany: jest.fn(async ({ where }: any) =>
        legs.filter(
          (l) =>
            where.transactionId.in.includes(l.transactionId) &&
            l.role === where.role &&
            l.provider === where.provider,
        ),
      ),
    },
  };
  const payoutOrders = new PayoutOrderRepository(prisma);
  const svc = new (RampService as any)(
    {},
    {
      get: jest.fn((k: string) =>
        k === 'RAMP_API_URL' || k === 'RAMP_API_KEY' ? 'x' : undefined,
      ),
    },
    prisma,
    {},
    {},
    {},
    {},
    {},
    payoutOrders,
    {},
    {},
    {},
    {},
  );
  return { svc: svc as RampService, prisma };
}

const row = (id: string, createdAt: string) => ({
  id,
  reference: `off_${id}`,
  status: 'PENDING',
  createdAt: new Date(createdAt),
  amount: 5,
});
const payout = (transactionId: string, over: Record<string, unknown> = {}) => ({
  id: `leg-${transactionId}`,
  transactionId,
  scope: 'USER',
  role: 'PAYOUT',
  provider: 'BITNOB',
  reference: `off_${transactionId}`,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('RampService.getTransactions — off-ramp payout order', () => {
  it('attaches each off-ramp its payout order with only the history fields, from the legs', async () => {
    const { svc, prisma } = build(
      [row('a', '2026-11-20T10:00:00Z'), row('b', '2026-11-20T09:00:00Z')],
      [
        payout('a', {
          providerReference: 'q-a',
          fundingAddress: 'GFUND',
          expectedAmount: '5.5',
          receivedAmount: '5.5',
          depositTxHash: '0xabc',
          failureReason: null,
          expiresAt: new Date('2026-11-21T00:00:00Z'),
          sourceAddress: 'GSRC',
          memo: 'secret-memo',
          failureDetail: { internal: true },
        }),
      ],
    );

    const res = await svc.getTransactions('user-1', false);

    const [a, b] = res.offramp;
    expect(a.providerOrder).toEqual({
      depositTxHash: '0xabc',
      failureReason: null,
      receivedAmount: '5.5',
      expectedAmount: '5.5',
      fundingAddress: 'GFUND',
      expiresAt: new Date('2026-11-21T00:00:00Z'),
    });
    expect(a.providerOrder).not.toHaveProperty('memo');
    expect(a.providerOrder).not.toHaveProperty('failureDetail');
    expect(b.providerOrder).toBeNull(); // an off-ramp with no payout order (e.g. Flint) stays null
    expect(a).toMatchObject({ status: 'PENDING', detailedStatus: 'PENDING' });
    // the list is loaded without the old relation, and with two leg queries however many off-ramps there are
    expect(
      JSON.stringify(prisma.offrampTransaction.findMany.mock.calls[0][0]),
    ).not.toContain('providerOrder');
    expect(prisma.transactionLeg.findMany).toHaveBeenCalledTimes(2);
  });
});
