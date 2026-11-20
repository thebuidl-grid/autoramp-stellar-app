/**
 * What a Stellar account can actually spend, so we can stop before asking the wallet to sign something that is
 * certain to fail (a burn bigger than the USDC balance, or no XLM to pay the network fee).
 */
import { IS_TESTNET } from "@/lib/constants/networks";
import { STELLAR_USDC_ISSUER } from "@/lib/cctp-stellar";

const STROOPS = 10_000_000n;

/** XLM the account must keep free for the network fee on the two Soroban calls (approve + burn). */
export const MIN_SPENDABLE_XLM_STROOPS = 11_000_000n; // 1.1 XLM

export interface StellarFunds {
  /** False when the account does not exist on the network yet. */
  exists: boolean;
  /** USDC balance in base units (7 dp). */
  usdcUnits: bigint;
  /** XLM above the account's reserve and open offers, in stroops. */
  spendableXlmStroops: bigint;
}

interface HorizonBalance {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
  selling_liabilities?: string;
}
interface HorizonAccount {
  balances?: HorizonBalance[];
  subentry_count?: number;
  num_sponsoring?: number;
  num_sponsored?: number;
}

/** "12.3456789" -> 123456789n. Ignores anything past 7 decimals. */
export function toUnits(amount: string | undefined): bigint {
  if (!amount || !/^\d+(\.\d+)?$/.test(amount)) return 0n;
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole) * STROOPS + BigInt((frac + "0000000").slice(0, 7));
}

/** Pure: Horizon account JSON -> funds. */
export function parseHorizonAccount(account: HorizonAccount, network: "testnet" | "mainnet"): StellarFunds {
  const issuer = STELLAR_USDC_ISSUER[network];
  const balances = account.balances ?? [];
  const usdc = balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === issuer);
  const native = balances.find((b) => b.asset_type === "native");
  // Reserve: (2 + subentries + sponsoring - sponsored) x 0.5 XLM, plus what is locked in open sell offers.
  const entries = 2 + (account.subentry_count ?? 0) + (account.num_sponsoring ?? 0) - (account.num_sponsored ?? 0);
  const reserve = (BigInt(Math.max(entries, 2)) * STROOPS) / 2n;
  const spendable = toUnits(native?.balance) - reserve - toUnits(native?.selling_liabilities);
  return {
    exists: true,
    usdcUnits: toUnits(usdc?.balance),
    spendableXlmStroops: spendable > 0n ? spendable : 0n,
  };
}

/** Looks the account up on Horizon. Returns null when Horizon cannot be reached (callers should not block on it). */
export async function fetchStellarFunds(address: string, signal?: AbortSignal): Promise<StellarFunds | null> {
  const network = IS_TESTNET ? "testnet" : "mainnet";
  const base = IS_TESTNET ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
  try {
    const res = await fetch(`${base}/accounts/${encodeURIComponent(address)}`, { signal, cache: "no-store" });
    if (res.status === 404) return { exists: false, usdcUnits: 0n, spendableXlmStroops: 0n };
    if (!res.ok) return null;
    return parseHorizonAccount((await res.json()) as HorizonAccount, network);
  } catch {
    return null;
  }
}

const fmt = (units: bigint) => {
  const n = Number(units) / Number(STROOPS);
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

export type FundsCheck = { ok: true } | { ok: false; reason: "no_account" | "usdc" | "xlm"; message: string };

/** Can this account burn `neededUnits` USDC and pay the network fee? */
export function checkStellarFunds(funds: StellarFunds, neededUnits: bigint): FundsCheck {
  if (!funds.exists) {
    return {
      ok: false,
      reason: "no_account",
      message: "This Stellar account isn't funded yet. It needs some XLM and USDC before it can send.",
    };
  }
  if (funds.usdcUnits < neededUnits) {
    return {
      ok: false,
      reason: "usdc",
      message: `Not enough USDC in your wallet: it has ${fmt(funds.usdcUnits)} USDC and this needs ${fmt(neededUnits)} USDC.`,
    };
  }
  if (funds.spendableXlmStroops < MIN_SPENDABLE_XLM_STROOPS) {
    return {
      ok: false,
      reason: "xlm",
      message: `Not enough XLM to pay the network fee: keep at least ${fmt(MIN_SPENDABLE_XLM_STROOPS)} XLM free (you have ${fmt(funds.spendableXlmStroops)} XLM beyond the account reserve).`,
    };
  }
  return { ok: true };
}

/** USDC needed on the form for a sell of `usdc`: the amount plus a small margin for the CCTP fast-transfer fee. */
export function usdcNeededForSell(usdc: number): bigint {
  if (!Number.isFinite(usdc) || usdc <= 0) return 0n;
  const units = toUnits(usdc.toFixed(7));
  return units + units / 1000n; // +0.1%
}
