/**
 * Wagmi Configuration
 * 
 * Configures wagmi and RainbowKit for wallet connection
 */

import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  rainbowWallet,
  walletConnectWallet,
  coinbaseWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';

// Get project ID from environment
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'default-project-id';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        rainbowWallet,
        walletConnectWallet,
        coinbaseWallet,
      ],
    },
  ],
  {
    appName: 'AutoRamp',
    projectId,
  }
);

/**
 * Wagmi config using createConfig directly to avoid MetaMask SDK
 */
export const wagmiConfig = createConfig({
  connectors,
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  ssr: false, // Disabled for client-only hydration via RootProvider
});

