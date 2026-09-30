/**
 * Stellar Wallet Kit Config
 *
 * Lazily-constructed singleton — the kit touches window/localStorage
 * internally, so it must only ever be created client-side.
 */
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit";

export const STELLAR_NETWORK: WalletNetwork =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? WalletNetwork.PUBLIC
    : WalletNetwork.TESTNET;

// WalletNetwork enum values *are* the network passphrase strings.
export const STELLAR_NETWORK_PASSPHRASE: string = STELLAR_NETWORK;

export const STELLAR_HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ||
  (STELLAR_NETWORK === WalletNetwork.PUBLIC
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org");

let kit: StellarWalletsKit | null = null;

function buildKit(): StellarWalletsKit {
  return new StellarWalletsKit({
    network: STELLAR_NETWORK,
    selectedWalletId: FREIGHTER_ID,
    modules: allowAllModules(),
  });
}

export function getStellarWalletsKit(): StellarWalletsKit {
  if (!kit) kit = buildKit();
  return kit;
}

/**
 * Forces a brand-new StellarWalletsKit instance instead of reusing the
 * cached one. Its constructor scans wallet availability exactly once,
 * racing each wallet's own check against a hard-coded 500ms timeout
 * (see @creit.tech/stellar-wallets-kit's getSupportedWallets()) — if
 * Freighter's response is even slightly slow at that one moment (cold
 * extension, page-load contention), it gets marked "Not available" and,
 * because the kit is normally cached for the whole session, that one bad
 * result poisons every connect dropdown afterward. Call this right
 * before opening the connect modal so the user always gets a fresh scan
 * rather than a stale one from whenever the kit first happened to be
 * constructed.
 */
export function refreshStellarWalletsKit(): StellarWalletsKit {
  kit = buildKit();
  return kit;
}
