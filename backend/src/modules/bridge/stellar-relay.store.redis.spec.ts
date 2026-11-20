import IORedis from 'ioredis';
import { StellarRelayStore } from './stellar-relay.store';

/** Integration test against a real Redis. Opt in: REDIS_TEST_URL=redis://localhost:6379 npx jest stellar-relay.store.redis */
const url = process.env.REDIS_TEST_URL;
const d = url ? describe : describe.skip;

d('StellarRelayStore (real Redis)', () => {
  const HASH = '0x' + 'cd'.repeat(32);
  let store: StellarRelayStore;
  let raw: IORedis;

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'true';
    process.env.REDIS_URL = url;
    raw = new IORedis(url!);
    await raw.flushdb();
    store = new StellarRelayStore();
  });
  afterAll(async () => {
    store.onModuleDestroy();
    raw.disconnect();
  });

  it('persists the minted hash in Redis (visible to another store instance)', async () => {
    await store.setMinted(HASH, 'mint1');
    expect(await raw.get(`stellar-relay:minted:${HASH}`)).toBe('mint1');
    const other = new StellarRelayStore(); // e.g. a second backend instance or a restart
    expect(await other.getMinted(HASH.toUpperCase().replace('0X', '0x'))).toBe(
      'mint1',
    );
    other.onModuleDestroy();
  });

  it('lock is exclusive across instances and can be released', async () => {
    const other = new StellarRelayStore();
    expect(await store.acquireLock(HASH)).toBe(true);
    expect(await other.acquireLock(HASH)).toBe(false);
    expect(await other.isLocked(HASH)).toBe(true);
    await store.releaseLock(HASH);
    expect(await other.acquireLock(HASH)).toBe(true);
    await other.releaseLock(HASH);
    other.onModuleDestroy();
  });

  it('counts requests per window and expires the counter', async () => {
    for (let i = 0; i < 3; i++)
      expect((await store.hit('u9', 3, 60)).allowed).toBe(true);
    expect((await store.hit('u9', 3, 60)).allowed).toBe(false);
    expect(await raw.ttl('stellar-relay:rl:u9')).toBeGreaterThan(0);
  });
});
