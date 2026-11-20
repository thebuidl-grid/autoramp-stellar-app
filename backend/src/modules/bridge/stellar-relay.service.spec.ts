import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StellarRelayService } from './stellar-relay.service';
import { StellarRelayStore } from './stellar-relay.store';

const HASH = '0x' + 'ab'.repeat(32);
const USER = { userId: 'u1' };

const cfg = (values: Record<string, string | undefined>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const iris = (body: unknown, ok = true) =>
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok, json: async () => body } as Response);

const completeMsg = (destinationDomain: string) => ({
  messages: [
    {
      status: 'complete',
      message: '0x01',
      attestation: '0x02',
      decodedMessage: { destinationDomain },
    },
  ],
});

/** Redis is disabled in unit tests: the store uses its in-memory fallback. */
let store: StellarRelayStore;
let transfer: any;
let prisma: any;

const make = (
  values: Record<string, string | undefined> = { STELLAR_RELAYER_SECRET: 'S' },
) => new StellarRelayService(cfg(values), prisma, store);

beforeAll(() => {
  process.env.REDIS_ENABLED = 'false';
});

beforeEach(() => {
  store = new StellarRelayStore();
  transfer = {
    id: 'b1',
    userId: 'u1',
    transactionHash: HASH,
    metadata: { SOURCE_TX: HASH },
  };
  prisma = {
    bridgeTransaction: {
      findFirst: jest.fn().mockImplementation(async () => transfer),
      update: jest.fn().mockResolvedValue({}),
    },
  };
});

afterEach(() => jest.restoreAllMocks());

describe('StellarRelayService', () => {
  it('reports pending while Circle has not attested the burn', async () => {
    iris({ messages: [{ status: 'pending_confirmations' }] });
    await expect(make().relay(HASH, 6, USER)).resolves.toEqual({
      status: 'pending',
    });
  });

  it('reports pending when Iris is unreachable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));
    await expect(make().relay(HASH, 6, USER)).resolves.toEqual({
      status: 'pending',
    });
  });

  it('uses the sandbox Iris on testnet and the live Iris on mainnet', async () => {
    const spy = iris({ messages: [] });
    await make({}).relay(HASH, 6, USER);
    expect(String(spy.mock.calls[0][0])).toContain(
      'iris-api-sandbox.circle.com',
    );
    await make({ CCTP_NETWORK: 'mainnet' }).relay(HASH, 6, USER);
    expect(String(spy.mock.calls[1][0])).toContain(
      'https://iris-api.circle.com',
    );
  });

  it('refuses burns that are not destined for Stellar', async () => {
    iris(completeMsg('6'));
    await expect(make().relay(HASH, 0, USER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('503s when the relayer key is not configured', async () => {
    iris(completeMsg('27'));
    await expect(make({}).relay(HASH, 6, USER)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('mints once, caches the hash, and does not mint the same burn twice', async () => {
    iris(completeMsg('27'));
    const svc = make();
    const mint = jest
      .spyOn(svc as any, 'mintAndForward')
      .mockResolvedValue('stellarmint1');
    await expect(svc.relay(HASH, 6, USER)).resolves.toEqual({
      status: 'complete',
      mintTxHash: 'stellarmint1',
    });
    await expect(svc.relay(HASH, 6, USER)).resolves.toEqual({
      status: 'complete',
      mintTxHash: 'stellarmint1',
    });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('records the mint on the bridge record and answers from it after the cache is lost', async () => {
    iris(completeMsg('27'));
    const svc = make();
    jest.spyOn(svc as any, 'mintAndForward').mockResolvedValue('stellarmint1');
    await svc.relay(HASH, 6, USER);
    expect(prisma.bridgeTransaction.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { metadata: { SOURCE_TX: HASH, STELLAR_MINT_TX: 'stellarmint1' } },
    });
    // Redis flushed and a fresh process: the DB record is still the source of truth.
    transfer.metadata = { SOURCE_TX: HASH, STELLAR_MINT_TX: 'stellarmint1' };
    const fresh = new StellarRelayService(
      cfg({ STELLAR_RELAYER_SECRET: 'S' }),
      prisma,
      new StellarRelayStore(),
    );
    const mint = jest.spyOn(fresh as any, 'mintAndForward');
    await expect(fresh.relay(HASH, 6, USER)).resolves.toEqual({
      status: 'complete',
      mintTxHash: 'stellarmint1',
    });
    expect(mint).not.toHaveBeenCalled();
  });

  it('reports minting for a burn that is already in flight (shared lock)', async () => {
    iris(completeMsg('27'));
    const svc = make();
    let release!: (h: string) => void;
    jest
      .spyOn(svc as any, 'mintAndForward')
      .mockReturnValue(new Promise<string>((r) => (release = r)));
    const first = svc.relay(HASH, 6, USER);
    await new Promise((r) => setImmediate(r));
    await expect(svc.relay(HASH, 6, USER)).resolves.toEqual({
      status: 'minting',
    });
    release('h');
    await first;
  });

  it('turns a mint failure into a 502 with only the first error line, and releases the lock', async () => {
    iris(completeMsg('27'));
    const svc = make();
    jest
      .spyOn(svc as any, 'mintAndForward')
      .mockRejectedValue(new Error('Contract, #3 replay\nhuge diagnostic log'));
    const err = await svc.relay(HASH, 6, USER).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(err.message).toBe('Contract, #3 replay');
    expect(await store.isLocked(HASH)).toBe(false);
  });

  describe('only relays burns we know about', () => {
    it("403s a burn that is not one of the caller's own bridge transfers", async () => {
      prisma.bridgeTransaction.findFirst.mockResolvedValue(null);
      const spy = iris(completeMsg('27'));
      await expect(make().relay(HASH, 6, USER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(spy).not.toHaveBeenCalled(); // never even asked Circle, let alone spent a fee
    });

    it('403s when the caller has no user or merchant identity', async () => {
      await expect(make().relay(HASH, 6, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.bridgeTransaction.findFirst).not.toHaveBeenCalled();
    });

    it('matches the hash case-insensitively and scopes the lookup to the caller', async () => {
      iris({ messages: [] });
      await make().relay(HASH, 6, { userId: 'u1', merchantId: 'm1' });
      expect(prisma.bridgeTransaction.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ userId: 'u1' }, { merchantId: 'm1' }],
          transactionHash: { equals: HASH, mode: 'insensitive' },
        },
      });
    });
  });

  it('rate limits each user to 30 relay requests per minute', async () => {
    iris({ messages: [] });
    const svc = make();
    for (let i = 0; i < 30; i++) await svc.relay(HASH, 6, USER);
    const err = await svc.relay(HASH, 6, USER).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    // another user is unaffected
    await expect(svc.relay(HASH, 6, { userId: 'u2' })).resolves.toBeDefined();
  });
});
