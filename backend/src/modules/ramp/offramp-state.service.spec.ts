import { OfframpStateService } from './offramp-state.service';
import { makeFakePrisma, seedOfframp } from './testing/fake-offramp-prisma';

const HASH = 'db2b46e83dcade2e1be63bce99eb2a7f9f0f2b43102a6821d7b8b0ad35cc837c';

describe('OfframpStateService — D1 end-to-end scenarios', () => {
  let fake: any;
  let svc: OfframpStateService;
  const OLD_ENV = process.env.OFFRAMP_SIMULATED_LIQUIDITY_USDC;

  beforeEach(() => {
    fake = makeFakePrisma();
    svc = new OfframpStateService(fake);
    delete process.env.OFFRAMP_SIMULATED_LIQUIDITY_USDC;
  });
  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.OFFRAMP_SIMULATED_LIQUIDITY_USDC;
    else process.env.OFFRAMP_SIMULATED_LIQUIDITY_USDC = OLD_ENV;
  });

  const statusOf = (id: string) => fake._db().tx.get(id).status;
  const logActions = (id: string) => fake._db().logs.filter((l: any) => l.transactionId === id).map((l: any) => l.action);

  describe('Test 1: successful off-ramp', () => {
    it('walks INITIATED -> COMPLETED, persists history and a MATCHED reconciliation record', async () => {
      const { id, reference } = seedOfframp(fake, { expectedUsdc: '3.125', fiat: '5000' });
      await svc.recordInitiated(id);

      expect((await svc.apply(id, 'AWAITING_DEPOSIT', { actor: 'system' })).outcome).toBe('APPLIED');
      expect((await svc.apply(id, 'DEPOSIT_DETECTED', { actor: 'stellar-watcher', receivedAmount: '3.125', txHash: HASH })).outcome).toBe('APPLIED');
      expect((await svc.apply(id, 'PROCESSING')).outcome).toBe('APPLIED');
      expect((await svc.beginPayout(id)).outcome).toBe('APPLIED');
      const done = await svc.apply(id, 'COMPLETED', { actor: 'bitnob-webhook', eventKey: 'bitnob:p1:payout.settled', settledFiatAmount: '5000' });
      expect(done.outcome).toBe('APPLIED');

      const view = (await svc.getView(reference))!;
      expect(view.status).toBe('COMPLETED');
      expect(view.successful).toBe(true);
      expect(view.stellarTxHash).toBe(HASH);
      expect(view.expectedPayout.amount).toBe('5000');
      expect(view.actualPayout.amount).toBe('5000');
      expect(view.timestamps.completedAt).toBeTruthy();
      expect(view.statusHistory.map((h) => h.to)).toEqual(['AWAITING_DEPOSIT', 'DEPOSIT_DETECTED', 'PROCESSING', 'PAYOUT_PENDING', 'COMPLETED']);
      expect(view.statusHistory.every((h) => h.at instanceof Date)).toBe(true);
      expect(view.reconciliation).toMatchObject({
        status: 'COMPLETED',
        reconciliationResult: 'MATCHED',
        stellarTxHash: HASH,
        expectedSettlement: '3.125',
        actualSettlement: '3.125',
        outstandingAmount: '0.0000000',
      });
      expect(view.reconciliation!.settledAt).toBeTruthy();
    });

    it('fills in intermediate steps when the provider skips ahead, and marks them inferred', async () => {
      const { id, reference } = seedOfframp(fake);
      await svc.apply(id, 'AWAITING_DEPOSIT');
      const res = await svc.apply(id, 'COMPLETED', { eventKey: 'bitnob:p9:payout.settled' });
      expect(res.steps).toEqual(['DEPOSIT_DETECTED', 'PROCESSING', 'PAYOUT_PENDING', 'COMPLETED']);
      const view = (await svc.getView(reference))!;
      expect(view.statusHistory.filter((h) => h.inferred).map((h) => h.to)).toEqual(['DEPOSIT_DETECTED', 'PROCESSING', 'PAYOUT_PENDING']);
      expect(view.statusHistory.at(-1)).toMatchObject({ to: 'COMPLETED', inferred: false });
    });

    it('creates a reconciliation record for every attempt, even one that never progresses', async () => {
      const { id, reference } = seedOfframp(fake);
      await svc.recordInitiated(id);
      const rec = await svc.getReconciliation(reference);
      expect(rec).toMatchObject({ status: 'INITIATED', reconciliationResult: 'IN_PROGRESS', asset: 'USDC', reference });
      expect(logActions(id)).toContain('cash_out_initiated');
    });
  });

  describe('Test 2: timeout', () => {
    it('expires with a recorded reason + timestamp, never looks successful, and persists across reads', async () => {
      const { id, reference } = seedOfframp(fake);
      await svc.apply(id, 'AWAITING_DEPOSIT');
      const res = await svc.apply(id, 'EXPIRED', {
        actor: 'expiry-sweeper',
        reason: 'timeout',
        detail: { windowMs: 1800000, since: '2026-11-10T10:00:00.000Z' },
      });
      expect(res.outcome).toBe('APPLIED');

      // "refresh": a fresh read from the store
      const view = (await svc.getView(reference))!;
      expect(view.status).toBe('EXPIRED');
      expect(view.successful).toBe(false);
      expect(view.failureReason).toBe('timeout');
      expect(view.failureDetail).toMatchObject({ windowMs: 1800000 });
      expect(view.statusMessage.toLowerCase()).toContain('support');
      expect(view.statusHistory.at(-1)).toMatchObject({ to: 'EXPIRED', reason: 'timeout', actor: 'expiry-sweeper' });
      expect(view.statusHistory.at(-1)!.at).toBeInstanceOf(Date);
      expect(view.reconciliation).toMatchObject({ reconciliationResult: 'TIMED_OUT', failureReason: 'timeout' });
    });

    it('cannot be revived into a successful state afterwards', async () => {
      const { id } = seedOfframp(fake);
      await svc.apply(id, 'EXPIRED', { reason: 'timeout' });
      expect((await svc.apply(id, 'COMPLETED')).outcome).toBe('REJECTED_TRANSITION');
      expect(statusOf(id)).toBe('EXPIRED');
    });
  });

  describe('Test 3: partial settlement', () => {
    it('expected 5 USDC, settled 2.5 USDC -> PARTIALLY_SETTLED with 2.5 outstanding', async () => {
      const { id, reference } = seedOfframp(fake, { expectedUsdc: '5' });
      await svc.apply(id, 'DEPOSIT_DETECTED', { receivedAmount: '2.5', txHash: HASH });
      const res = await svc.apply(id, 'PARTIALLY_SETTLED', { actor: 'bitnob-webhook', receivedAmount: '2.5' });
      expect(res.outcome).toBe('APPLIED');

      const view = (await svc.getView(reference))!;
      expect(view.status).toBe('PARTIALLY_SETTLED');
      expect(view.successful).toBe(false);
      expect(view.settlement).toMatchObject({ expected: '5.0000000', received: '2.5000000', outstanding: '2.5000000', kind: 'PARTIAL' });
      expect(view.failureReason).toBe('partial_settlement');
      expect(view.reconciliation).toMatchObject({
        reconciliationResult: 'UNDERPAID',
        expectedSettlement: '5',
        actualSettlement: '2.5',
        outstandingAmount: '2.5000000',
      });
      // settlement audit record is preserved
      expect(view.statusHistory.at(-1)).toMatchObject({ to: 'PARTIALLY_SETTLED' });
    });

    it('can be completed after the outstanding amount is topped up', async () => {
      const { id } = seedOfframp(fake, { expectedUsdc: '5' });
      await svc.apply(id, 'DEPOSIT_DETECTED', { receivedAmount: '2.5' });
      await svc.apply(id, 'PARTIALLY_SETTLED', { receivedAmount: '2.5' });
      const res = await svc.apply(id, 'COMPLETED', { receivedAmount: '5', eventKey: 'topup-1' });
      expect(res.outcome).toBe('APPLIED');
      expect((await svc.getReconciliation(fake._db().tx.get(id).reference))!.reconciliationResult).toBe('MATCHED');
    });
  });

  describe('Test 4: rejected payout', () => {
    it('captures the rejection response + reason, preserves the deposit, and never shows as completed', async () => {
      const { id, reference } = seedOfframp(fake);
      await svc.apply(id, 'DEPOSIT_DETECTED', { receivedAmount: '5', txHash: HASH });
      await svc.apply(id, 'PAYOUT_PENDING');
      const res = await svc.apply(id, 'REJECTED', {
        actor: 'bitnob-webhook',
        eventKey: 'bitnob:p2:payout.failed',
        providerStatus: 'payout.failed',
        reason: 'rejected',
        detail: { providerResponse: { code: 'ACCOUNT_RESTRICTED', message: 'Beneficiary account restricted' } },
      });
      expect(res.outcome).toBe('APPLIED');

      const view = (await svc.getView(reference))!;
      expect(view.status).toBe('REJECTED');
      expect(view.successful).toBe(false);
      expect(view.timestamps.completedAt).toBeNull();
      expect(view.failureReason).toBe('rejected');
      expect(view.failureDetail).toMatchObject({ providerResponse: { code: 'ACCOUNT_RESTRICTED' } });
      expect(view.stellarTxHash).toBe(HASH); // original deposit information preserved
      expect(view.settlement.received).toBe('5.0000000');
      expect(view.statusHistory.at(-1)!.at).toBeInstanceOf(Date); // rejection timestamp
      expect(view.reconciliation!.reconciliationResult).toBe('PAYOUT_REJECTED');
    });
  });

  describe('Test 5: reversal', () => {
    it('reverses a completed payout, links the reversal to the original, and keeps the full history', async () => {
      const { id, reference } = seedOfframp(fake, { expectedUsdc: '3.75', fiat: '6000' });
      await svc.apply(id, 'COMPLETED', { receivedAmount: '3.75', txHash: HASH, settledFiatAmount: '6000', eventKey: 'p3:settled' });
      const res = await svc.apply(id, 'REVERSED', {
        actor: 'bitnob-webhook',
        eventKey: 'p3:reversed',
        reason: 'reversal',
        reversal: { amount: '3.75', reason: 'Interbank clearing reversal', providerEventId: 'rev-evt-1' },
      });
      expect(res.outcome).toBe('APPLIED');

      const view = (await svc.getView(reference))!;
      expect(view.status).toBe('REVERSED');
      expect(view.successful).toBe(false);
      expect(view.reversal).toMatchObject({ amount: '3.75', reason: 'Interbank clearing reversal', originalStatus: 'COMPLETED', providerEventId: 'rev-evt-1' });
      expect(fake._db().reversals.get(id).offrampTransactionId).toBe(id); // linked to the original
      expect(view.statusHistory.map((h) => h.to).slice(-2)).toEqual(['COMPLETED', 'REVERSED']); // original history preserved
      expect(view.stellarTxHash).toBe(HASH);
      expect(view.reconciliation!.reconciliationResult).toBe('FUNDS_REVERSED');
    });

    it('prevents duplicate reversal processing (same event, and a second reversal attempt)', async () => {
      const { id } = seedOfframp(fake);
      await svc.apply(id, 'COMPLETED', { eventKey: 'p4:settled' });
      await svc.apply(id, 'REVERSED', { eventKey: 'p4:reversed', reversal: { amount: '5', providerEventId: 'rev-9' } });
      const same = await svc.apply(id, 'REVERSED', { eventKey: 'p4:reversed', reversal: { amount: '5', providerEventId: 'rev-9' } });
      const other = await svc.apply(id, 'REVERSED', { eventKey: 'p4:reversed-again', reversal: { amount: '5', providerEventId: 'rev-10' } });
      expect(same.outcome).toBe('DUPLICATE');
      expect(other.outcome).toBe('NOOP'); // already reversed
      expect(fake._db().reversals.size).toBe(1);
      expect(statusOf(id)).toBe('REVERSED');
    });
  });

  describe('Test 6: insufficient liquidity', () => {
    it('checks liquidity before payout, holds the transaction and records the shortfall', async () => {
      process.env.OFFRAMP_SIMULATED_LIQUIDITY_USDC = '3';
      const { id, reference } = seedOfframp(fake, { expectedUsdc: '5' });
      await svc.apply(id, 'PROCESSING');
      const res = await svc.beginPayout(id, { actor: 'payout-gate' });

      expect(res.outcome).toBe('APPLIED');
      expect(res.liquidity).toEqual({ ok: false, required: '5.0000000', available: '3.0000000', shortfall: '2.0000000' });

      const view = (await svc.getView(reference))!;
      expect(view.status).toBe('INSUFFICIENT_LIQUIDITY');
      expect(view.successful).toBe(false);
      expect(view.failureReason).toBe('insufficient_liquidity');
      expect(view.failureDetail).toEqual({ required: '5.0000000', available: '3.0000000', shortfall: '2.0000000' });
      expect(view.reconciliation).toMatchObject({ reconciliationResult: 'LIQUIDITY_SHORTFALL', failureDetail: { shortfall: '2.0000000' } });
    });

    it('preserves the transaction for retry once liquidity is available', async () => {
      process.env.OFFRAMP_SIMULATED_LIQUIDITY_USDC = '3';
      const { id } = seedOfframp(fake, { expectedUsdc: '5' });
      await svc.apply(id, 'PROCESSING');
      await svc.beginPayout(id);
      expect(statusOf(id)).toBe('INSUFFICIENT_LIQUIDITY');

      process.env.OFFRAMP_SIMULATED_LIQUIDITY_USDC = '10';
      const retry = await svc.beginPayout(id);
      expect(retry.outcome).toBe('APPLIED');
      expect(statusOf(id)).toBe('PAYOUT_PENDING');
    });

    it('does not gate the payout when no liquidity limit is configured', async () => {
      const { id } = seedOfframp(fake, { expectedUsdc: '5' });
      await svc.apply(id, 'PROCESSING');
      await svc.beginPayout(id);
      expect(statusOf(id)).toBe('PAYOUT_PENDING');
    });
  });

  describe('Test 7: invalid state transition', () => {
    it('rejects it, leaves the valid state unchanged, and logs the rejected transition', async () => {
      const { id } = seedOfframp(fake);
      await svc.apply(id, 'COMPLETED', { eventKey: 'p5:settled' });
      const before = fake._db().logs.length;

      const res = await svc.apply(id, 'PROCESSING', { actor: 'bitnob-webhook', eventKey: 'p5:late-processing' });
      expect(res.outcome).toBe('REJECTED_TRANSITION');
      expect(statusOf(id)).toBe('COMPLETED');
      expect(fake._db().completedAt).toBeUndefined();

      const rejected = fake._db().logs.slice(before).filter((l: any) => l.action === 'transition_rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ oldStatus: 'COMPLETED', newStatus: 'PROCESSING' });
      expect(rejected[0].description).toContain('not an allowed transition');
      // the rejected event key was not consumed
      expect(fake._db().events.has('p5:late-processing')).toBe(false);
    });

    it.each([
      ['EXPIRED', 'COMPLETED'],
      ['REJECTED', 'PAYOUT_PENDING'],
      ['FAILED', 'AWAITING_DEPOSIT'],
    ])('keeps %s final (cannot move to %s)', async (from, to) => {
      const { id } = seedOfframp(fake, { status: from });
      expect((await svc.apply(id, to as any)).outcome).toBe('REJECTED_TRANSITION');
      expect(statusOf(id)).toBe(from);
    });
  });

  describe('Test 8: duplicate event', () => {
    it('applies the same settlement event once, ignores the replay, and logs it', async () => {
      const { id, reference } = seedOfframp(fake, { fiat: '5000' });
      const event = { actor: 'bitnob-webhook', eventKey: 'bitnob:p6:payout.settled', settledFiatAmount: '5000' };
      const first = await svc.apply(id, 'COMPLETED', event);
      const completedAt = fake._db().tx.get(id).completedAt;
      const second = await svc.apply(id, 'COMPLETED', event);

      expect(first.outcome).toBe('APPLIED');
      expect(second.outcome).toBe('DUPLICATE');
      expect(fake._db().tx.get(id).completedAt).toBe(completedAt); // not settled twice

      const view = (await svc.getView(reference))!;
      expect(view.statusHistory.filter((h) => h.to === 'COMPLETED')).toHaveLength(1);
      expect(view.auditLog.map((a) => a.action)).toContain('duplicate_event_ignored');
      expect(fake._db().events.size).toBe(1);
    });

    it('also acknowledges a replay that arrives while the transaction already moved on', async () => {
      const { id } = seedOfframp(fake);
      await svc.apply(id, 'DEPOSIT_DETECTED', { eventKey: 'dep-1' });
      await svc.apply(id, 'PROCESSING', { eventKey: 'proc-1' });
      expect((await svc.apply(id, 'DEPOSIT_DETECTED', { eventKey: 'dep-1' })).outcome).toBe('DUPLICATE');
      expect(statusOf(id)).toBe('PROCESSING');
    });
  });

  describe('integrity', () => {
    it('rolls everything back if any write in the transition fails (no half-applied state)', async () => {
      const { id } = seedOfframp(fake);
      jest.spyOn(fake.offrampReconciliation, 'upsert').mockRejectedValueOnce(new Error('db down'));
      await expect(svc.apply(id, 'AWAITING_DEPOSIT', { eventKey: 'x1' })).rejects.toThrow('db down');
      expect(statusOf(id)).toBe('INITIATED');
      expect(fake._db().events.has('x1')).toBe(false);
      expect(fake._db().logs.filter((l: any) => l.action === 'status_transition')).toHaveLength(0);
    });

    it('reports NOT_FOUND for an unknown transaction and CONFLICT on a concurrent change', async () => {
      expect((await svc.apply('missing', 'COMPLETED')).outcome).toBe('NOT_FOUND');
      const { id } = seedOfframp(fake, { status: 'AWAITING_DEPOSIT' });
      jest.spyOn(fake.offrampTransaction, 'updateMany').mockResolvedValueOnce({ count: 0 });
      expect((await svc.apply(id, 'DEPOSIT_DETECTED')).outcome).toBe('CONFLICT');
      expect(statusOf(id)).toBe('AWAITING_DEPOSIT');
    });

    it('lets a user see only their own transactions', async () => {
      const { reference } = seedOfframp(fake, { userId: 'alice' });
      expect(await svc.getView(reference, 'bob')).toBeNull();
      expect(await svc.getView(reference, 'alice')).not.toBeNull();
    });

    it('lists reconciliation records with filters', async () => {
      const a = seedOfframp(fake);
      const b = seedOfframp(fake, { expectedUsdc: '2.18' });
      await svc.recordInitiated(a.id);
      await svc.recordInitiated(b.id);
      await svc.apply(b.id, 'EXPIRED', { reason: 'timeout' });
      expect(await svc.listReconciliations()).toHaveLength(2);
      const timedOut = await svc.listReconciliations({ result: 'TIMED_OUT' });
      expect(timedOut).toHaveLength(1);
      expect(timedOut[0].reference).toBe(b.reference);
    });
  });
});
