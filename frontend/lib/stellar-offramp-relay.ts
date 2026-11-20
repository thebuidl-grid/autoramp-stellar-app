/**
 * Stellar off-ramp over CCTP + Base. The backend opens the payout on Base and tells the wallet exactly what to
 * burn; the user never sees or types a deposit address. These helpers are pure (no wallet/network access).
 */
import { STELLAR_CCTP_DOMAIN } from "@/lib/cctp-stellar";
import { IS_TESTNET } from "@/lib/constants/networks";

const BASE_CCTP_DOMAIN = 6;

/** The `bridge` block of POST /ramp/offramp for a relayed Stellar order. */
export interface StellarRelayBridge {
  via: "cctp";
  sourceDomain: number;
  destinationDomain: number;
  /** Bitnob's Base deposit address: set by the backend, never shown to or editable by the user. */
  mintRecipient: string;
  /** USDC to burn on Stellar, 7-dp base units. */
  burnAmountUnits: string;
  /** Fee ceiling for the fast transfer, 7-dp base units. */
  maxFeeUnits: string;
  network: "testnet" | "mainnet";
}

/** Validate the backend's instructions before any wallet prompt. */
export function parseRelayBridge(raw: unknown): StellarRelayBridge {
  const b = raw as Partial<StellarRelayBridge> | null | undefined;
  if (!b || b.via !== "cctp") throw new Error("Missing transfer instructions from the server");
  if (b.sourceDomain !== STELLAR_CCTP_DOMAIN || b.destinationDomain !== BASE_CCTP_DOMAIN) {
    throw new Error("Unexpected transfer route from the server");
  }
  if (typeof b.mintRecipient !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(b.mintRecipient)) {
    throw new Error("Invalid payout destination from the server");
  }
  if (typeof b.burnAmountUnits !== "string" || !/^\d+$/.test(b.burnAmountUnits) || BigInt(b.burnAmountUnits) <= 0n) {
    throw new Error("Invalid transfer amount from the server");
  }
  if (typeof b.maxFeeUnits !== "string" || !/^\d+$/.test(b.maxFeeUnits)) {
    throw new Error("Invalid transfer fee from the server");
  }
  const expected = IS_TESTNET ? "testnet" : "mainnet";
  if (b.network !== expected) {
    throw new Error(`This order is for ${b.network}, but the app is on ${expected}`);
  }
  return b as StellarRelayBridge;
}

export interface RelayStatus {
  state: "awaiting_burn" | "attesting" | "minting" | "minted";
  mintTxHash?: string;
  message?: string;
}

/**
 * Poll the backend relay until the USDC has been minted to the payout provider. Transient request errors are
 * retried; the order is safe on the server either way, so a timeout only means "still working".
 */
export async function waitForRelay(
  reference: string,
  relay: (reference: string) => Promise<RelayStatus>,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    onState?: (s: RelayStatus["state"]) => void;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<RelayStatus> {
  const interval = opts.intervalMs ?? 5000;
  const timeout = opts.timeoutMs ?? 20 * 60_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = Date.now();
  let lastState: RelayStatus["state"] | undefined;
  while (Date.now() - started < timeout) {
    try {
      const status = await relay(reference);
      if (status.state !== lastState) {
        lastState = status.state;
        opts.onState?.(status.state);
      }
      if (status.state === "minted") return status;
    } catch {
      // transient (network, relayer busy / out of gas): keep trying until the timeout
    }
    await sleep(interval);
  }
  throw new Error(
    "Your transfer is still being processed. Your USDC is safe, and your payout will arrive once it completes.",
  );
}

/**
 * Soroban RPC reports a missing account as "Account not found: G…". That almost always means the wallet's
 * account lives on the other network (a testnet account while the app is on mainnet, or the reverse), or it was
 * never funded with XLM. Say that, instead of a raw RPC message.
 */
export function explainStellarAccountError(
  error: unknown,
  network: "testnet" | "mainnet",
): Error | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!/account not found/i.test(message)) return null;
  const other = network === "mainnet" ? "testnet" : "mainnet";
  return new Error(
    `Your Stellar account isn't funded on ${network}. The app is on ${network}. ` +
      `Use an account that has XLM and USDC on ${network}, or switch the app to ${other} (the network switch in the header) if your wallet is on ${other}.`,
  );
}
