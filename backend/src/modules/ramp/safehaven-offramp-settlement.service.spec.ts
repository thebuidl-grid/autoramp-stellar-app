import { SafehavenOfframpSettlementService } from './safehaven-offramp-settlement.service';

function build(flag = 'true') {
  const prisma: any = {
    offrampEvent: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
    offrampTransaction: {
      findUnique: jest.fn().mockResolvedValue({ metadata: { safehaven: { accountNumber: '111' } } }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
    },
  };
  const config: any = { get: jest.fn((k: string) => (k === 'SAFEHAVEN_NGN_SETTLEMENT' ? flag : undefined)) };
  const safehaven: any = { transfer: jest.fn(), createVirtualAccount: jest.fn() };
  const state: any = { apply: jest.fn().mockResolvedValue({ outcome: 'APPLIED' }) };
  return { svc: new SafehavenOfframpSettlementService(prisma, config, safehaven, state), prisma, safehaven, state };
}

const tx = {
  id: 't1',
  reference: 'off_1',
  status: 'PROCESSING',
  amount: 1000,
  bankCode: '058',
  accountNumber: '0123456789',
  metadata: { safehaven: { accountNumber: '111' } },
};

describe('SafehavenOfframpSettlementService', () => {
  it('is on by default and only for NGN user off-ramps', () => {
    const { svc } = build('true');
    expect(svc.isEnabledFor('NG', false)).toBe(true);
    expect(svc.isEnabledFor('NG', true)).toBe(false);
    expect(svc.isEnabledFor('KE', false)).toBe(false);
    expect(build('false').svc.isEnabledFor('NG', false)).toBe(false);
    // on by default when the env var is unset
    expect(build(undefined as any).svc.isEnabledFor('NG', false)).toBe(true);
  });

  it('creates a per-order virtual account and falls back to the configured bank code', async () => {
    const { svc, safehaven } = build();
    safehaven.createVirtualAccount.mockResolvedValue({ data: { accountNumber: '999', accountName: 'AUTORAMP' } });
    const acct = await svc.createCollectionAccount('off_1', 1000);
    expect(acct).toMatchObject({ accountNumber: '999', accountName: 'AUTORAMP' });
    expect(safehaven.createVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({ externalReference: 'off_1', amount: 1000 }),
    );
  });

  it('forwards the credited NGN to the user bank and completes when SafeHaven confirms', async () => {
    const { svc, safehaven, state } = build();
    safehaven.transfer.mockResolvedValue({ responseCode: '00', data: { status: 'Completed' } });
    const res = await svc.settleCredit(tx, { amount: 1000 });
    expect(res.status).toBe('success');
    expect(safehaven.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        beneficiaryBankCode: '058',
        beneficiaryAccountNumber: '0123456789',
        amount: 1000,
        paymentReference: 'off_1-FWD',
      }),
      expect.anything(),
    );
    expect(state.apply).toHaveBeenCalledWith('t1', 'PAYOUT_PENDING', expect.anything());
    expect(state.apply).toHaveBeenCalledWith('t1', 'COMPLETED', expect.objectContaining({ settledFiatAmount: '1000' }));
  });

  it('waits for the debit webhook when the transfer is not yet final', async () => {
    const { svc, safehaven, state } = build();
    safehaven.transfer.mockResolvedValue({ responseCode: '00', data: { status: 'Processing' } });
    await svc.settleCredit(tx, { amount: 1000 });
    expect(state.apply).not.toHaveBeenCalledWith('t1', 'COMPLETED', expect.anything());
  });

  it('never forwards twice: a second credit for the same order is ignored', async () => {
    const { svc, prisma, safehaven } = build();
    prisma.offrampEvent.create.mockRejectedValueOnce(new Error('unique'));
    const res = await svc.settleCredit(tx, { amount: 1000 });
    expect(res).toMatchObject({ status: 'ignored', reason: 'already_forwarding' });
    expect(safehaven.transfer).not.toHaveBeenCalled();
  });

  it('forwards only the expected amount if overpaid, and marks short credits PARTIALLY_SETTLED', async () => {
    const over = build();
    over.safehaven.transfer.mockResolvedValue({ data: { status: 'Completed' } });
    await over.svc.settleCredit(tx, { amount: 1200 });
    expect(over.safehaven.transfer).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000 }), expect.anything());

    const short = build();
    short.safehaven.transfer.mockResolvedValue({ data: { status: 'Completed' } });
    await short.svc.settleCredit(tx, { amount: 800 });
    expect(short.state.apply).toHaveBeenCalledWith('t1', 'PARTIALLY_SETTLED', expect.anything());
  });

  it('on transfer failure keeps the order in PAYOUT_PENDING, releases the claim and flags it for review', async () => {
    const { svc, prisma, safehaven, state } = build();
    safehaven.transfer.mockRejectedValue(new Error('NIP down'));
    await expect(svc.settleCredit(tx, { amount: 1000 })).rejects.toThrow('NIP down');
    expect(prisma.offrampEvent.deleteMany).toHaveBeenCalledWith({ where: { eventKey: 'safehaven-forward:off_1' } });
    expect(prisma.offrampTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { metadata: { safehaven: expect.objectContaining({ needsReview: true, forwardError: 'NIP down' }) } },
      }),
    );
    expect(state.apply).not.toHaveBeenCalledWith('t1', 'COMPLETED', expect.anything());
  });

  it('completes on a successful debit webhook and is idempotent on a completed order', async () => {
    const { svc, state } = build();
    await svc.settleDebit({ ...tx, status: 'PAYOUT_PENDING' }, 'COMPLETED', { amount: 1000 });
    expect(state.apply).toHaveBeenCalledWith('t1', 'COMPLETED', expect.anything());
    state.apply.mockClear();
    const res = await svc.settleDebit({ ...tx, status: 'COMPLETED' }, 'COMPLETED', {});
    expect(res.status).toBe('ignored');
    expect(state.apply).not.toHaveBeenCalled();
  });
});
