/**
 * Wagmi Configuration
 *
 * Configures wagmi and RainbowKit for wallet connection
 */

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
  rabbyWallet,
  oktoWallet,
  okxWallet,
  phantomWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { SUPPORTED_CHAINS, getRpcUrl } from "./constants/networks";

/**
 * CORS-safe fallback RPCs for chains whose viem default endpoint blocks
 * browser requests (eth.merkle.io rate-limits and omits CORS headers).
 * NEXT_PUBLIC_RPC_* env vars (via getRpcUrl) take precedence when set.
 */
const FALLBACK_RPC_URLS: Record<number, string | undefined> = {
  1: "https://ethereum-rpc.publicnode.com",
};

// Get project ID from environment
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "default-project-id";

const connectors =
  typeof window !== "undefined"
    ? connectorsForWallets(
        [
          {
            groupName: "Popular",
            wallets: [
              injectedWallet,
              metaMaskWallet,
              rainbowWallet,
              phantomWallet,
            ],
          },
          {
            groupName: "Others",
            wallets: [
              walletConnectWallet,
              rabbyWallet,
              trustWallet,
              oktoWallet,
              okxWallet,
            ],
          },
        ],
        {
          appName: "AutoRamp",
          projectId,
        },
      )
    : [];

/**
 * Wagmi config using createConfig directly to avoid MetaMask SDK
 */
export const wagmiConfig = createConfig({
  connectors,
  chains: SUPPORTED_CHAINS as any,
  multiInjectedProviderDiscovery: true,
  transports: Object.fromEntries(
    SUPPORTED_CHAINS.map((chain) => [
      chain.id,
      http(getRpcUrl(chain.id) || FALLBACK_RPC_URLS[chain.id] || undefined),
    ]),
  ),
  ssr: false, // Disabled for client-only hydration via RootProvider
});
