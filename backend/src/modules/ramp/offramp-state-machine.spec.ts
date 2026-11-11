import {
  FINAL_STATES,
  InvalidTransitionError,
  OFFRAMP_STATES,
  OfframpState,
  TRANSITIONS,
  assertTransition,
  canTransition,
  checkLiquidity,
  computeSettlement,
  describeState,
  fromUnits,
  isFinalState,
  isTimedOut,
  normalizeStatus,
  reconciliationResult,
  shortestPath,
  timeoutMsFor,
  toUnits,
} from './offramp-state-machine';

describe('offramp state machine', () => {
  describe('states', () => {
    it('defines exactly the 13 states required by the ticket', () => {
      expect([...OFFRAMP_STATES].sort()).toEqual(
        [
          'INITIATED',
          'AWAITING_DEPOSIT',
          'DEPOSIT_DETECTED',
          'PROCESSING',
          'CONVERSION_PENDING',
          'PAYOUT_PENDING',
          'COMPLETED',
          'PARTIALLY_SETTLED',
          'FAILED',
          'REJECTED',
          'REVERSED',
          'EXPIRED',
          'INSUFFICIENT_LIQUIDITY',
        ].sort(),
      );
    });

    it('has a transition entry for every state', () => {
      for (const s of OFFRAMP_STATES) expect(TRANSITIONS[s]).toBeDefined();
    });
  });

  describe('transitions', () => {
    it('allows exactly the transitions in the table and nothing else (all 169 pairs)', () => {
      for (const from of OFFRAMP_STATES) {
        for (const to of OFFRAMP_STATES) {
          expect(canTransition(from, to)).toBe(TRANSITIONS[from].includes(to));
        }
      }
    });

    it('follows the happy path INITIATED -> ... -> COMPLETED', () => {
      const path: OfframpState[] = [
        'INITIATED',
        'AWAITING_DEPOSIT',
        'DEPOSIT_DETECTED',
        'PROCESSING',
        'CONVERSION_PENDING',
        'PAYOUT_PENDING',
        'COMPLETED',
      ];
      for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
    });

    it.each([
      ['COMPLETED', 'PROCESSING'],
      ['EXPIRED', 'COMPLETED'],
      ['REJECTED', 'COMPLETED'],
      ['FAILED', 'AWAITING_DEPOSIT'],
      ['REVERSED', 'COMPLETED'],
      ['AWAITING_DEPOSIT', 'COMPLETED'],
      ['PAYOUT_PENDING', 'DEPOSIT_DETECTED'],
      ['INITIATED', 'PAYOUT_PENDING'],
      ['COMPLETED', 'COMPLETED'],
    ])('rejects the invalid transition %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
    });

    it('never transitions back into INITIATED', () => {
      for (const s of OFFRAMP_STATES) expect(canTransition(s, 'INITIATED')).toBe(false);
    });

    it('treats FAILED, REJECTED, REVERSED and EXPIRED as final', () => {
      expect([...FINAL_STATES].sort()).toEqual(['EXPIRED', 'FAILED', 'REJECTED', 'REVERSED']);
      for (const s of FINAL_STATES) expect(TRANSITIONS[s]).toHaveLength(0);
      expect(isFinalState('COMPLETED')).toBe(false); // can still be reversed
    });

    it('only allows COMPLETED to be reversed', () => {
      expect(TRANSITIONS.COMPLETED).toEqual(['REVERSED']);
    });

    it('can reach every state from INITIATED', () => {
      const seen = new Set<OfframpState>(['INITIATED']);
      const queue: OfframpState[] = ['INITIATED'];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const next of TRANSITIONS[cur]) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect([...seen].sort()).toEqual([...OFFRAMP_STATES].sort());
    });

    it('exposes the offending states on InvalidTransitionError', () => {
      try {
        assertTransition('COMPLETED', 'PROCESSING');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidTransitionError);
        expect((e as InvalidTransitionError).from).toBe('COMPLETED');
        expect((e as InvalidTransitionError).to).toBe('PROCESSING');
        expect((e as InvalidTransitionError).code).toBe('INVALID_TRANSITION');
      }
    });
  });

  describe('shortestPath', () => {
    it('walks provider events that skip steps through every intermediate state', () => {
      expect(shortestPath('AWAITING_DEPOSIT', 'PROCESSING')).toEqual(['DEPOSIT_DETECTED', 'PROCESSING']);
      expect(shortestPath('PROCESSING', 'COMPLETED')).toEqual(['PAYOUT_PENDING', 'COMPLETED']);
      expect(shortestPath('INITIATED', 'COMPLETED')).toEqual([
        'AWAITING_DEPOSIT',
        'DEPOSIT_DETECTED',
        'PROCESSING',
        'PAYOUT_PENDING',
        'COMPLETED',
      ]);
    });

    it('never infers an exceptional outcome (e.g. a partial settlement) as an intermediate step', () => {
      const path = shortestPath('INITIATED', 'COMPLETED')!;
      for (const s of ['PARTIALLY_SETTLED', 'INSUFFICIENT_LIQUIDITY', 'REJECTED', 'FAILED', 'EXPIRED', 'REVERSED']) {
        expect(path).not.toContain(s);
      }
      expect(shortestPath('INSUFFICIENT_LIQUIDITY', 'COMPLETED')).toEqual(['PAYOUT_PENDING', 'COMPLETED']);
      expect(shortestPath('PARTIALLY_SETTLED', 'COMPLETED')).toEqual(['COMPLETED']);
    });

    it('returns a single step for a direct transition and [] when already there', () => {
      expect(shortestPath('PAYOUT_PENDING', 'REJECTED')).toEqual(['REJECTED']);
      expect(shortestPath('PROCESSING', 'PROCESSING')).toEqual([]);
    });

    it('works from legacy statuses', () => {
      expect(shortestPath('PENDING', 'DEPOSIT_DETECTED')).toEqual(['DEPOSIT_DETECTED']);
    });

    it('returns null for unreachable or unknown targets (invalid transitions)', () => {
      expect(shortestPath('COMPLETED', 'PROCESSING')).toBeNull();
      expect(shortestPath('EXPIRED', 'COMPLETED')).toBeNull();
      expect(shortestPath('REJECTED', 'AWAITING_DEPOSIT')).toBeNull();
      expect(shortestPath('PROCESSING', 'NOPE')).toBeNull();
    });

    it('every path it returns consists only of allowed transitions', () => {
      for (const a of OFFRAMP_STATES) {
        for (const b of OFFRAMP_STATES) {
          const path = shortestPath(a, b);
          if (!path) continue;
          let cur: string = a;
          for (const step of path) {
            expect(canTransition(cur, step)).toBe(true);
            cur = step;
          }
          if (a !== b) expect(cur).toBe(b);
        }
      }
    });
  });

  describe('legacy status mapping', () => {
    it('maps pre-existing TransactionStatus values onto the new model', () => {
      expect(normalizeStatus('PENDING')).toBe('AWAITING_DEPOSIT');
      expect(normalizeStatus('PARTIAL')).toBe('PARTIALLY_SETTLED');
      expect(normalizeStatus('CANCELLED')).toBe('FAILED');
      expect(normalizeStatus('REFUNDED')).toBe('REVERSED');
      expect(normalizeStatus('completed')).toBe('COMPLETED');
      expect(normalizeStatus('NOT_A_STATE')).toBeNull();
      expect(normalizeStatus(undefined)).toBeNull();
    });

    it('lets rows still stored as PENDING move through the new flow', () => {
      expect(canTransition('PENDING', 'DEPOSIT_DETECTED')).toBe(true);
      expect(canTransition('PENDING', 'EXPIRED')).toBe(true);
      expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    });

    it('rejects unknown statuses in either position', () => {
      expect(canTransition('NOPE', 'COMPLETED')).toBe(false);
      expect(canTransition('PROCESSING', 'NOPE')).toBe(false);
    });
  });

  describe('timeouts', () => {
    it('has configurable defaults for active states and none for final states', () => {
      expect(timeoutMsFor('AWAITING_DEPOSIT', {})).toBe(30 * 60 * 1000);
      expect(timeoutMsFor('PAYOUT_PENDING', {})).toBe(60 * 60 * 1000);
      expect(timeoutMsFor('INSUFFICIENT_LIQUIDITY', {})).toBe(24 * 60 * 60 * 1000);
      for (const s of FINAL_STATES) expect(timeoutMsFor(s, {})).toBeUndefined();
      expect(timeoutMsFor('COMPLETED', {})).toBeUndefined();
    });

    it('honours environment overrides and ignores invalid ones', () => {
      expect(timeoutMsFor('AWAITING_DEPOSIT', { OFFRAMP_TIMEOUT_AWAITING_DEPOSIT_MS: '5000' })).toBe(5000);
      expect(timeoutMsFor('AWAITING_DEPOSIT', { OFFRAMP_TIMEOUT_AWAITING_DEPOSIT_MS: 'abc' })).toBe(30 * 60 * 1000);
      expect(timeoutMsFor('AWAITING_DEPOSIT', { OFFRAMP_TIMEOUT_AWAITING_DEPOSIT_MS: '-1' })).toBe(30 * 60 * 1000);
    });

    it('detects a transaction pending beyond its window', () => {
      const env = { OFFRAMP_TIMEOUT_AWAITING_DEPOSIT_MS: '60000' };
      const since = new Date('2026-11-10T10:00:00Z');
      expect(isTimedOut('AWAITING_DEPOSIT', since, new Date('2026-11-10T10:00:59Z'), env)).toBe(false);
      expect(isTimedOut('AWAITING_DEPOSIT', since, new Date('2026-11-10T10:01:00Z'), env)).toBe(true);
      expect(isTimedOut('COMPLETED', since, new Date('2027-01-01T00:00:00Z'), env)).toBe(false);
    });
  });

  describe('settlement', () => {
    it('handles the ticket example: expected 5 USDC, settled 2.5 USDC', () => {
      const r = computeSettlement('5', '2.5');
      expect(r).toEqual({ expected: '5.0000000', received: '2.5000000', outstanding: '2.5000000', excess: '0.0000000', kind: 'PARTIAL' });
    });

    it('classifies full, over-paid and nothing-received settlements', () => {
      expect(computeSettlement('3.125', '3.1250000').kind).toBe('FULL');
      expect(computeSettlement('3.125', '3.1250000').outstanding).toBe('0.0000000');
      const over = computeSettlement('1', '1.25');
      expect(over.kind).toBe('OVERPAID');
      expect(over.excess).toBe('0.2500000');
      expect(computeSettlement('1', '0').kind).toBe('NONE');
      expect(computeSettlement('1', null).kind).toBe('NONE');
    });

    it('is exact to 7 decimal places (no floating-point drift)', () => {
      expect(computeSettlement('0.3000000', '0.1000000').outstanding).toBe('0.2000000');
      expect(computeSettlement('10.1609890', '10.1609889').outstanding).toBe('0.0000001');
    });

    it('accepts Prisma-Decimal-like values and rejects garbage', () => {
      expect(toUnits({ toString: () => '2.5' })).toBe(25000000n);
      expect(() => toUnits('abc')).toThrow('Invalid amount');
      expect(() => toUnits('-1')).toThrow('Invalid amount');
      expect(fromUnits(25000000n)).toBe('2.5000000');
    });
  });

  describe('liquidity', () => {
    it('reports the required, available and shortfall amounts when short', () => {
      expect(checkLiquidity('5', '3.25')).toEqual({ ok: false, required: '5.0000000', available: '3.2500000', shortfall: '1.7500000' });
    });

    it('passes when liquidity equals or exceeds the payout', () => {
      expect(checkLiquidity('5', '5').ok).toBe(true);
      expect(checkLiquidity('5', '100')).toEqual({ ok: true, required: '5.0000000', available: '100.0000000', shortfall: '0.0000000' });
    });
  });

  describe('reconciliation + messages', () => {
    const full = computeSettlement('5', '5');
    const part = computeSettlement('5', '2.5');

    it.each([
      ['COMPLETED', full, 'MATCHED'],
      ['COMPLETED', computeSettlement('5', '6'), 'OVERPAID'],
      ['PARTIALLY_SETTLED', part, 'UNDERPAID'],
      ['REJECTED', full, 'PAYOUT_REJECTED'],
      ['REVERSED', full, 'FUNDS_REVERSED'],
      ['INSUFFICIENT_LIQUIDITY', full, 'LIQUIDITY_SHORTFALL'],
      ['EXPIRED', computeSettlement('5', '0'), 'TIMED_OUT'],
      ['FAILED', full, 'FAILED'],
      ['PAYOUT_PENDING', full, 'IN_PROGRESS'],
      ['PENDING', full, 'IN_PROGRESS'],
    ])('classifies %s as %s', (state, settlement, expected) => {
      expect(reconciliationResult(state as string, settlement as ReturnType<typeof computeSettlement>)).toBe(expected);
    });

    it('presents ONLY completed transactions as successful', () => {
      for (const s of OFFRAMP_STATES) expect(describeState(s).successful).toBe(s === 'COMPLETED');
    });

    it('gives every state a label and a message, with support guidance on bad outcomes', () => {
      for (const s of OFFRAMP_STATES) {
        const d = describeState(s);
        expect(d.label.length).toBeGreaterThan(2);
        expect(d.message.length).toBeGreaterThan(10);
      }
      for (const s of ['EXPIRED', 'REJECTED', 'FAILED', 'INSUFFICIENT_LIQUIDITY', 'PARTIALLY_SETTLED'] as const) {
        expect(describeState(s).message.toLowerCase()).toContain('support');
      }
    });
  });
});
