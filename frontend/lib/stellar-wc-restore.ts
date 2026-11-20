/**
 * Mobile WalletConnect return trip.
 *
 * Connecting a Stellar wallet on a phone sends the user to their wallet app and back. While they are away the
 * browser may suspend or reload the page, and the in-page "waiting for approval" promise is lost, so even though
 * the wallet approved, the app never records the connection. WalletConnect itself keeps the approved session, so we
 * can recover the address from it. This is the pure part: picking the right session.
 */

export type StellarWcChain = "stellar:pubnet" | "stellar:testnet";

export interface WcSessionLike {
  topic: string;
  /** Unix seconds. */
  expiry: number;
  namespaces?: { stellar?: { accounts?: string[] } };
}

const G_ADDRESS = /^G[A-Z2-7]{55}$/;

/**
 * Latest unexpired session that has an account on `chain`. Accounts look like "stellar:pubnet:G...".
 * Sessions for the other network are ignored, so a testnet session never connects a mainnet app.
 */
export function pickStellarSession(
  sessions: WcSessionLike[],
  chain: StellarWcChain,
  nowSeconds: number,
): { address: string; topic: string } | null {
  const candidates: Array<{ address: string; topic: string; expiry: number }> = [];
  for (const s of sessions ?? []) {
    if (!s || typeof s.expiry !== "number" || s.expiry <= nowSeconds) continue;
    for (const account of s.namespaces?.stellar?.accounts ?? []) {
      const [ns, net, address] = String(account).split(":");
      if (ns === "stellar" && `${ns}:${net}` === chain && G_ADDRESS.test(address ?? "")) {
        candidates.push({ address, topic: s.topic, expiry: s.expiry });
      }
    }
  }
  candidates.sort((a, b) => b.expiry - a.expiry);
  const best = candidates[0];
  return best ? { address: best.address, topic: best.topic } : null;
}

/** A connect attempt is "pending" for this long after it starts. Longer than a wallet approval ever needs. */
export const WC_PENDING_WINDOW_MS = 15 * 60_000;

export function isPending(startedAt: number | null | undefined, now: number): boolean {
  return !!startedAt && Number.isFinite(startedAt) && now - startedAt >= 0 && now - startedAt <= WC_PENDING_WINDOW_MS;
}
