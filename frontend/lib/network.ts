/**
 * Runtime testnet/mainnet selection.
 *
 * The build-time default comes from NEXT_PUBLIC_NETWORK, but users can switch
 * networks from the UI. The choice is persisted to localStorage (read
 * synchronously by client modules) and to a cookie (read by server route
 * handlers), then the page reloads so every module-level constant
 * (wagmi chains, token addresses, Stellar/Stacks networks, ...) re-derives.
 */

export type NetworkMode = "testnet" | "mainnet";

export const NETWORK_COOKIE = "autoramp-network";

export const DEFAULT_NETWORK: NetworkMode =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

function isNetworkMode(value: unknown): value is NetworkMode {
  return value === "testnet" || value === "mainnet";
}

/** Active network for client modules (localStorage → cookie → build default). */
export function getActiveNetwork(): NetworkMode {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  try {
    const stored = window.localStorage.getItem(NETWORK_COOKIE);
    if (isNetworkMode(stored)) return stored;
  } catch {
    // localStorage can be unavailable (private mode, blocked storage).
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${NETWORK_COOKIE}=([^;]*)`),
  );
  const cookie = match ? decodeURIComponent(match[1]) : null;
  return isNetworkMode(cookie) ? cookie : DEFAULT_NETWORK;
}

/** Normalize a cookie/token value to a known network (defaults on unknown). */
export function parseNetwork(value: string | null | undefined): NetworkMode {
  return isNetworkMode(value) ? value : DEFAULT_NETWORK;
}

/** Persist the choice (localStorage + cookie) and reload the app. */
export function setActiveNetwork(mode: NetworkMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NETWORK_COOKIE, mode);
  } catch {
    // ignore storage failures
  }
  document.cookie = `${NETWORK_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

/** Mirror localStorage into the cookie so server route handlers agree. */
export function syncNetworkCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${NETWORK_COOKIE}=${getActiveNetwork()}; path=/; max-age=31536000; samesite=lax`;
}
