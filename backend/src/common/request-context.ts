import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Per-request facts that many write paths need but that do not belong in every method signature. Today: which chain network the
 * website was on (its mainnet/testnet toggle) when the request was made, so every transaction can record whether it was real or a test.
 */
export type ChainNetwork = 'mainnet' | 'testnet';

interface Store {
  chainNetwork: ChainNetwork | null;
}

const storage = new AsyncLocalStorage<Store>();

export const CHAIN_NETWORK_HEADER = 'x-chain-network';

/** Only the two known values count. Anything else (missing, misspelt, hostile) is "unknown", never guessed. */
export function parseChainNetwork(value: unknown): ChainNetwork | null {
  const v = Array.isArray(value) ? value[0] : value;
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'mainnet' || s === 'testnet' ? s : null;
}

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ chainNetwork: parseChainNetwork(req.headers[CHAIN_NETWORK_HEADER]) }, next);
}

/** The network the current request's client was on, or null outside a request (webhooks, jobs) or when it did not say. */
export function currentChainNetwork(): ChainNetwork | null {
  return storage.getStore()?.chainNetwork ?? null;
}

/** Run `fn` as if a request on `network` made it. For tests and for jobs that act on behalf of a known network. */
export function runWithChainNetwork<T>(network: ChainNetwork | null, fn: () => T): T {
  return storage.run({ chainNetwork: network }, fn);
}
