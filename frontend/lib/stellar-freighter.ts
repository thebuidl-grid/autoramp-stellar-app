/**
 * Freighter (the Stellar browser extension, now also branded Varial). Used when the extension is present; otherwise
 * the wallet connects over WalletConnect (see stellar-walletconnect.ts). Lazy-loaded so the extension API is only
 * fetched when a Stellar wallet is used.
 */
import { IS_TESTNET } from "@/lib/constants/networks";

const PASSPHRASE = IS_TESTNET ? "Test SDF Network ; September 2015" : "Public Global Stellar Network ; September 2015";

function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  return (e as { message?: string })?.message || "Freighter returned an error.";
}

/** Extensions inject late, so give the check a moment instead of reading `window` once. */
export async function isFreighterAvailable(timeoutMs = 1500): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { isConnected } = await import("@stellar/freighter-api");
    const res = await Promise.race([
      isConnected(),
      new Promise<{ isConnected: boolean }>((resolve) => setTimeout(() => resolve({ isConnected: false }), timeoutMs)),
    ]);
    return !!res?.isConnected;
  } catch {
    return false;
  }
}

/** Ask Freighter for access (the user approves in the extension popup) and return the account address. */
export async function connectFreighter(): Promise<{ address: string }> {
  const api = await import("@stellar/freighter-api");
  const access = await api.requestAccess();
  if (access.error || !access.address) {
    throw new Error(access.error ? errorMessage(access.error) : "Freighter didn't share an account.");
  }
  const net = await api.getNetwork().catch(() => null);
  if (net && !net.error && net.networkPassphrase && net.networkPassphrase !== PASSPHRASE) {
    throw new Error(
      `Freighter is on ${net.network || "another network"}. Switch it to ${IS_TESTNET ? "Testnet" : "Mainnet (Public)"} and try again.`,
    );
  }
  return { address: access.address };
}

/** The address Freighter currently exposes to this site, without prompting. Null if access isn't granted. */
export async function currentFreighterAddress(): Promise<string | null> {
  try {
    const api = await import("@stellar/freighter-api");
    const allowed = await api.isAllowed();
    if (!allowed.isAllowed) return null;
    const res = await api.getAddress();
    return res.error ? null : res.address || null;
  } catch {
    return null;
  }
}

export async function signWithFreighter(address: string, xdr: string): Promise<string> {
  const api = await import("@stellar/freighter-api");
  const res = await api.signTransaction(xdr, { networkPassphrase: PASSPHRASE, address });
  if (res.error || !res.signedTxXdr) {
    throw new Error(res.error ? errorMessage(res.error) : "Freighter didn't return a signed transaction.");
  }
  return res.signedTxXdr;
}
