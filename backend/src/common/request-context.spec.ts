import { currentChainNetwork, parseChainNetwork, requestContextMiddleware, runWithChainNetwork } from './request-context';

describe('request context: chain network', () => {
  it('accepts only mainnet and testnet, any case, and never guesses', () => {
    expect(parseChainNetwork('testnet')).toBe('testnet');
    expect(parseChainNetwork(' MAINNET ')).toBe('mainnet');
    expect(parseChainNetwork(['testnet'])).toBe('testnet');
    for (const bad of [undefined, null, '', 'devnet', 'main', 42, {}]) expect(parseChainNetwork(bad)).toBeNull();
  });

  it('is unknown outside a request', () => {
    expect(currentChainNetwork()).toBeNull();
  });

  it('carries the header through the whole request, including async work', async () => {
    let seen: unknown[] = [];
    await new Promise<void>((resolve) =>
      requestContextMiddleware({ headers: { 'x-chain-network': 'testnet' } } as never, {} as never, async () => {
        seen.push(currentChainNetwork());
        await new Promise((r) => setTimeout(r, 5));
        seen.push(currentChainNetwork());
        resolve();
      }),
    );
    expect(seen).toEqual(['testnet', 'testnet']);
    expect(currentChainNetwork()).toBeNull(); // does not leak out
  });

  it('keeps concurrent requests apart', async () => {
    const run = (net: string) =>
      new Promise<string | null>((resolve) =>
        requestContextMiddleware({ headers: { 'x-chain-network': net } } as never, {} as never, async () => {
          await new Promise((r) => setTimeout(r, net === 'mainnet' ? 10 : 1));
          resolve(currentChainNetwork());
        }),
      );
    expect(await Promise.all([run('mainnet'), run('testnet')])).toEqual(['mainnet', 'testnet']);
  });

  it('runWithChainNetwork sets it for a job', () => {
    expect(runWithChainNetwork('mainnet', () => currentChainNetwork())).toBe('mainnet');
  });
});
