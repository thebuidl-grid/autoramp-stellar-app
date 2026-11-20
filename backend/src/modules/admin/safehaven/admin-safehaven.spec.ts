import { NotFoundException } from '@nestjs/common';
import { AdminSafehavenService, likePattern } from './admin-safehaven.service';
import { ACCOUNTS_SQL, CCTP_SQL, TRANSACTIONS_SQL, UNMATCHED, kindsFor } from './safehaven-queries';

const make = (rows: any[][]) => {
  const calls: any[][] = [];
  const queue = [...rows];
  const prisma: any = { $queryRawUnsafe: jest.fn(async (...args: any[]) => (calls.push(args), queue.shift() ?? [])) };
  return { svc: new AdminSafehavenService(prisma), calls };
};

describe('likePattern', () => {
  it('wraps text for ILIKE and escapes the wildcard characters', () => {
    expect(likePattern(' ada ')).toBe('%ada%');
    expect(likePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
    expect(likePattern('')).toBeNull();
    expect(likePattern(undefined)).toBeNull();
  });
});

describe('kindsFor', () => {
  it('turns a filter into the kinds it stands for, and ignores anything else', () => {
    expect(kindsFor('customer')).toEqual(['virtual', 'user_deposit']);
    expect(kindsFor('merchant')).toEqual(['merchant_sub', 'merchant_main']);
    expect(kindsFor('merchant_sub')).toEqual(['merchant_sub']);
    expect(kindsFor('nonsense')).toBeNull();
    expect(kindsFor(undefined)).toBeNull();
  });
});

describe('AdminSafehavenService', () => {
  it('lists accounts with the filter and search bound as parameters, never inlined', async () => {
    const { svc, calls } = make([[{ kind: 'virtual', accountNumber: '1', total: 7 }, { kind: 'merchant_sub', accountNumber: '2', total: 7 }]]);
    const out = await svc.accounts({ kind: 'virtual', q: "x'; DROP TABLE users;--", limit: 10, offset: 20 });
    expect(out).toEqual({ total: 7, limit: 10, offset: 20, items: [{ kind: 'virtual', accountNumber: '1' }, { kind: 'merchant_sub', accountNumber: '2' }] });
    expect(calls[0][0]).toBe(ACCOUNTS_SQL);
    expect(calls[0].slice(1)).toEqual([['virtual'], "%x'; DROP TABLE users;--%", 10, 20]);
    expect(ACCOUNTS_SQL).not.toContain('DROP');
  });

  it('clamps paging and treats nothing as no filter', async () => {
    const { svc, calls } = make([[]]);
    const out = await svc.accounts({ limit: 5000, offset: -3 });
    expect(out).toEqual({ total: 0, limit: 100, offset: 0, items: [] });
    expect(calls[0].slice(1)).toEqual([null, null, 100, 0]);
  });

  it('filters transactions by status and by whether they matched one of ours', async () => {
    const { svc, calls } = make([[{ id: 'e1', total: 1 }]]);
    await svc.transactions({ status: ' Completed ', matched: false, q: '5012', limit: 25, offset: 0 });
    expect(calls[0][0]).toBe(TRANSACTIONS_SQL);
    expect(calls[0].slice(1)).toEqual(['Completed', false, '%5012%', 25, 0]);
    const second = make([[]]);
    await second.svc.transactions({});
    expect(second.calls[0].slice(1)).toEqual([null, null, null, 25, 0]);
  });

  it('treats the all-zero UUID as unmatched, so "not matched" really means that', () => {
    expect(UNMATCHED).toContain('00000000-0000-0000-0000-000000000000');
    expect(TRANSACTIONS_SQL).toContain(UNMATCHED);
  });

  it('returns one account with its events, and 404s on an unknown number', async () => {
    const { svc, calls } = make([[{ accountNumber: '601', kind: 'user_deposit', total: 1 }], [{ id: 'e1' }]]);
    const out = await svc.account('601');
    expect(out).toEqual({ account: { accountNumber: '601', kind: 'user_deposit' }, events: [{ id: 'e1' }] });
    expect(calls[1].slice(1)).toEqual(['601']);
    await expect(make([[]]).svc.account('999')).rejects.toBeInstanceOf(NotFoundException);
    // a search match that is not the exact number does not count
    await expect(make([[{ accountNumber: '6010' }]]).svc.account('601')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the CCTP query covers bridge transfers and relayed off-ramps', () => {
    expect(CCTP_SQL).toContain("'bridge'");
    expect(CCTP_SQL).toContain("'offramp_relay'");
    expect(CCTP_SQL).toContain('FROM bridge_transactions');
    expect(CCTP_SQL).toContain('JOIN offramp_transactions');
  });

  it('lists CCTP transfers', async () => {
    const { svc, calls } = make([[{ reference: 'BRG-1', total: 3 }]]);
    const out = await svc.cctp({ status: 'FAILED', q: '0xabc' });
    expect(out.total).toBe(3);
    expect(calls[0][0]).toBe(CCTP_SQL);
    expect(calls[0].slice(1)).toEqual(['FAILED', '%0xabc%', 25, 0]);
  });
});
