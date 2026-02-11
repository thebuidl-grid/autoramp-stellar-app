/**
 * Wagmi Configuration
 *
 * Configures wagmi and RainbowKit for wallet connection
 */

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
  rabbyWallet,
  trustWallet,
  okxWallet,
  phantomWallet,
  baseAccount,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { SUPPORTED_CHAINS, getRpcUrl } from "./constants/networks";

// Get project ID from environment
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "default-project-id";

const connectors =
  typeof window !== "undefined"
    ? connectorsForWallets(
        [
          {
            groupName: "Recommended",
            wallets: [
              rainbowWallet,
              walletConnectWallet,
              metaMaskWallet,
              rabbyWallet,
              trustWallet,
              okxWallet,
              phantomWallet,
              baseAccount,
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
  transports: Object.fromEntries(
    SUPPORTED_CHAINS.map((chain) => [chain.id, http(getRpcUrl(chain.id))]),
  ),
  ssr: false, // Disabled for client-only hydration via RootProvider
});
