jest.mock('./stellar-relay.service', () => ({ StellarRelayService: class {} }));
jest.mock('./evm-relay.service', () => ({
  EvmRelayService: class {},
  isStellarToBase: (f: string, t: string) =>
    /stellar/i.test(f) && /^base/i.test(t),
}));

import {
  BridgeAutoRelayService,
  needsRelay,
} from './bridge-auto-relay.service';

const NOW = new Date('2026-11-20T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const T = (over: Record<string, unknown> = {}) =>
  ({
    id: 't',
    reference: 'BRG-1',
    status: 'PENDING',
    transactionHash: 'abc',
    metadata: {},
    updatedAt: ago(30),
    fromChain: 'Stellar',
    toChain: 'Base',
    userId: 'u1',
    ...over,
  }) as any;
const MIN = 10 * 60_000;
const DAYS3 = 3 * 86_400_000;

describe('needsRelay', () => {
  it('wants a confirmed burn that has sat unminted past the grace period', () => {
    expect(needsRelay(T(), NOW, MIN, DAYS3)).toBe(true);
    expect(needsRelay(T({ status: 'FAILED' }), NOW, MIN, DAYS3)).toBe(true); // a timeout after the burn can still be delivered
  });
  it("leaves alone: no burn yet, delivered, minted, too fresh (the user's wallet may still be signing), or too old", () => {
    expect(needsRelay(T({ transactionHash: null }), NOW, MIN, DAYS3)).toBe(
      false,
    );
    expect(needsRelay(T({ status: 'COMPLETED' }), NOW, MIN, DAYS3)).toBe(false);
    for (const k of ['EVM_MINT_TX', 'STELLAR_MINT_TX', 'DESTINATION_TX'])
      expect(needsRelay(T({ metadata: { [k]: '0x1' } }), NOW, MIN, DAYS3)).toBe(
        false,
      );
    expect(needsRelay(T({ updatedAt: ago(5) }), NOW, MIN, DAYS3)).toBe(false);
    expect(
      needsRelay(T({ updatedAt: ago(60 * 24 * 5) }), NOW, MIN, DAYS3),
    ).toBe(false);
  });
});

describe('BridgeAutoRelayService.sweep', () => {
  const build = (rows: any[]) => {
    const prisma: any = {
      bridgeTransaction: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const evm: any = {
      relayTransfer: jest
        .fn()
        .mockResolvedValue({ status: 'complete', mintTxHash: '0x1' }),
    };
    const stellar: any = {
      relay: jest
        .fn()
        .mockResolvedValue({ status: 'complete', mintTxHash: 'abc' }),
    };
    return {
      svc: new BridgeAutoRelayService(prisma, evm, stellar),
      prisma,
      evm,
      stellar,
    };
  };

  it('finishes Stellar to Base through the Base relay and Base to Stellar through the Stellar relay', async () => {
    const { svc, evm, stellar } = build([
      T(),
      T({
        id: 't2',
        fromChain: 'Base',
        toChain: 'Stellar',
        transactionHash: '0x' + 'a'.repeat(64),
      }),
    ]);
    expect(await svc.sweep(NOW)).toBe(2);
    expect(evm.relayTransfer).toHaveBeenCalledTimes(1);
    expect(stellar.relay).toHaveBeenCalledWith('0x' + 'a'.repeat(64), 6, {
      userId: 'u1',
    });
  });

  it('asks only for unfinished transfers inside the window, oldest first', async () => {
    const { svc, prisma } = build([]);
    await svc.sweep(NOW);
    const q = prisma.bridgeTransaction.findMany.mock.calls[0][0];
    expect(q.where.status).toEqual({ not: 'COMPLETED' });
    expect(q.where.transactionHash).toEqual({ not: null });
    expect(q.where.updatedAt.lt).toEqual(ago(10));
    expect(q.where.updatedAt.gt).toEqual(new Date(NOW.getTime() - DAYS3));
    expect(q.orderBy).toEqual({ updatedAt: 'asc' });
  });

  it('skips ones already minted, and one failing relay does not stop the rest', async () => {
    const { svc, evm } = build([
      T({ metadata: { EVM_MINT_TX: '0x1' } }),
      T({ id: 'bad' }),
      T({ id: 'ok' }),
    ]);
    evm.relayTransfer
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValueOnce({ status: 'complete' });
    expect(await svc.sweep(NOW)).toBe(1);
    expect(evm.relayTransfer).toHaveBeenCalledTimes(2);
  });

  it('does not overlap itself and counts pending as not delivered', async () => {
    const { svc, evm } = build([T()]);
    evm.relayTransfer.mockResolvedValue({ status: 'pending' });
    expect(await svc.sweep(NOW)).toBe(0);
  });
});
