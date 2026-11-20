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
import { WALLETCONNECT_PROJECT_ID } from "@/lib/constants/walletconnect";
import { SUPPORTED_CHAINS, getRpcUrl } from "./constants/networks";

/**
 * CORS-safe fallback RPCs for chains whose viem default endpoint blocks
 * browser requests (eth.merkle.io rate-limits and omits CORS headers).
 * NEXT_PUBLIC_RPC_* env vars (via getRpcUrl) take precedence when set.
 */
const FALLBACK_RPC_URLS: Record<number, string | undefined> = {
  1: "https://ethereum-rpc.publicnode.com",
};

const projectId = WALLETCONNECT_PROJECT_ID;

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
          // Mobile: the wallet app only knows how to send the user back to the
          // browser if the dapp metadata carries a redirect (universal link).
          // Without it the wallet opens and the user is stranded there.
          walletConnectParameters: {
            metadata: {
              name: "AutoRamp",
              description: "AutoRamp",
              url: window.location.origin,
              icons: [`${window.location.origin}/favicon.ico`],
              redirect: {
                universal: window.location.origin,
              },
            },
          },
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
