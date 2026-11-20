import { SafehavenOnrampSettlementService } from './safehaven-onramp-settlement.service';

function build(flag?: string, extra: Record<string, string> = {}) {
  const prisma: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    onrampTransaction: {
      findUnique: jest.fn().mockResolvedValue({ metadata: { safehaven: { accountNumber: '111' } } }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
    },
  };
  const config: any = { get: jest.fn((k: string) => (k === 'SAFEHAVEN_NGN_SETTLEMENT' ? flag : extra[k])) };
  const safehaven: any = { transfer: jest.fn(), createVirtualAccount: jest.fn() };
  const trader: any = { startOnrampFromFiat: jest.fn().mockResolvedValue({ status: 'processed' }) };
  const moduleRef: any = { get: jest.fn().mockReturnValue(trader) };
  return { svc: new SafehavenOnrampSettlementService(prisma, config, safehaven, moduleRef), prisma, safehaven, trader };
}

const tx = {
  id: 't1',
  reference: 'onr_1',
  status: 'PENDING',
  amount: 5000,
  metadata: { safehaven: { accountNumber: '111' } },
};

describe('SafehavenOnrampSettlementService', () => {
  it('is on by default, only for NGN user orders, and off when the flag is false', () => {
    expect(build().svc.isEnabledFor('NG', false)).toBe(true);
    expect(build().svc.isEnabledFor('NG', true)).toBe(false);
    expect(build().svc.isEnabledFor('GH', false)).toBe(false);
    expect(build('false').svc.isEnabledFor('NG', false)).toBe(false);
  });

  it('creates a per-order SafeHaven deposit account', async () => {
    const { svc, safehaven } = build();
    safehaven.createVirtualAccount.mockResolvedValue({
      data: { accountNumber: '999', accountName: 'AUTORAMP', bankName: 'SafeHaven' },
    });
    const acct = await svc.createDepositAccount('onr_1', 5000);
    expect(acct).toMatchObject({ provider: 'safehaven', accountNumber: '999' });
    expect(safehaven.createVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({ externalReference: 'onr_1', amount: 5000 }),
    );
  });

  it('starts the Bitnob trade for the credited amount, with no SafeHaven transfer', async () => {
    const { svc, safehaven, trader } = build();
    const res = await svc.settleCredit(tx, { amount: 5000 });
    expect(res.status).toBe('success');
    expect(trader.startOnrampFromFiat).toHaveBeenCalledWith(tx, 5000);
    expect(safehaven.transfer).not.toHaveBeenCalled();
  });

  it('settles only once: a lost claim means no trade', async () => {
    const { svc, prisma, trader } = build();
    prisma.$executeRaw.mockResolvedValueOnce(0);
    const res = await svc.settleCredit(tx, { amount: 5000 });
    expect(res).toMatchObject({ status: 'ignored', reason: 'already_settling' });
    expect(trader.startOnrampFromFiat).not.toHaveBeenCalled();
  });

  it('ignores credits for orders that are no longer PENDING', async () => {
    const { svc, trader } = build();
    const res = await svc.settleCredit({ ...tx, status: 'PROCESSING' }, { amount: 5000 });
    expect(res.status).toBe('ignored');
    expect(trader.startOnrampFromFiat).not.toHaveBeenCalled();
  });

  it('ignores invalid credit amounts', async () => {
    const { svc, trader } = build();
    expect((await svc.settleCredit(tx, { amount: 'x' })).status).toBe('ignored');
    expect(trader.startOnrampFromFiat).not.toHaveBeenCalled();
  });

  it('flags the order for review when the trade fails', async () => {
    const { svc, trader, prisma } = build();
    trader.startOnrampFromFiat.mockRejectedValue(new Error('insufficient NGN balance'));
    const res = await svc.settleCredit(tx, { amount: 5000 });
    expect(res).toMatchObject({ status: 'failed' });
    expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: { safehaven: expect.objectContaining({ needsReview: true, settlementError: 'insufficient NGN balance' }) },
        },
      }),
    );
  });

  describe('Bitnob float refill', () => {
    const funded = { BITNOB_FUNDING_ACCOUNT_NUMBER: '1234567890' };

    it('is skipped (and the order still succeeds) when no funding account is configured', async () => {
      const { svc, safehaven } = build();
      const res = await svc.settleCredit(tx, { amount: 5000 });
      expect(res.status).toBe('success');
      expect(safehaven.transfer).not.toHaveBeenCalled();
    });

    it('sends the credited NGN to the Bitnob funding account (Globus by default) after the trade', async () => {
      const { svc, safehaven, trader } = build(undefined, funded);
      safehaven.transfer.mockResolvedValue({ responseCode: '00' });
      const res = await svc.settleCredit(tx, { amount: 5000 });
      expect(res.status).toBe('success');
      expect(trader.startOnrampFromFiat.mock.invocationCallOrder[0]).toBeLessThan(safehaven.transfer.mock.invocationCallOrder[0]);
      expect(safehaven.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          beneficiaryBankCode: '000027',
          beneficiaryAccountNumber: '1234567890',
          amount: 5000,
          paymentReference: 'onr_1-FLOAT',
        }),
        expect.anything(),
      );
    });

    it('does not refill when the trade failed', async () => {
      const { svc, safehaven, trader } = build(undefined, funded);
      trader.startOnrampFromFiat.mockRejectedValue(new Error('insufficient balance'));
      await svc.settleCredit(tx, { amount: 5000 });
      expect(safehaven.transfer).not.toHaveBeenCalled();
    });

    it('refills only once: a lost claim means no transfer', async () => {
      const { svc, safehaven, prisma } = build(undefined, funded);
      prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0); // settlement claim ok, float claim lost
      await svc.settleCredit(tx, { amount: 5000 });
      expect(safehaven.transfer).not.toHaveBeenCalled();
    });

    it('a failed refill is flagged but does not fail the order', async () => {
      const { svc, safehaven, prisma } = build(undefined, funded);
      safehaven.transfer.mockRejectedValue(new Error('NIP down'));
      const res = await svc.settleCredit(tx, { amount: 5000 });
      expect(res.status).toBe('success');
      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { metadata: { safehaven: expect.objectContaining({ floatError: 'NIP down' }) } },
        }),
      );
    });
  });
});
