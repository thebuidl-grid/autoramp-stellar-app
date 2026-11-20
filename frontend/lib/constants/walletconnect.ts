/**
 * WalletConnect (Reown) project id. It is public (it ships in the browser bundle), so it is hardcoded here as the
 * default and the live build no longer depends on the env var being set. NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, if set,
 * still overrides it.
 */
export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "e8d4643e567f3e6829d5565a0211ceb9";
