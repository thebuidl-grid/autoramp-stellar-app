/**
 * Wagmi Configuration
 * 
 * Configures wagmi and RainbowKit for wallet connection
 */

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

// Get project ID from environment
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

if (!projectId) {
  console.warn('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. Wallet connection may not work.');
}

/**
 * Wagmi config for RainbowKit
 * Configured for Base network (mainnet)
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'CNGN Ramp',
  projectId: projectId || 'default-project-id', // Replace with your WalletConnect project ID
  chains: [base], // Base network
  ssr: true, // Enable server-side rendering support
});

