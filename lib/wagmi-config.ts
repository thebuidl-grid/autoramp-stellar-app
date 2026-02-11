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
  baseAccount,
  metaMaskWallet,
  rabbyWallet,
  oktoWallet,
  okxWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";

// Get project ID from environment
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "default-project-id";

const connectors =
  typeof window !== "undefined"
    ? connectorsForWallets(
        [
          {
            groupName: "Available",
            wallets: [injectedWallet],
          },
          {
            groupName: "Recommended",
            wallets: [
              rainbowWallet,
              walletConnectWallet,
              baseAccount,
              metaMaskWallet,
              rabbyWallet,
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
  chains: [base, mainnet],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: false, // Disabled for client-only hydration via RootProvider
});
