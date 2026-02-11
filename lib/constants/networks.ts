/**
 * Networks Configuration
 *
 * Centralized network settings for switching between Mainnet and Testnet.
 */

import {
  base,
  mainnet,
  arbitrum,
  optimism,
  polygon,
  baseSepolia,
  sepolia,
  arbitrumSepolia,
  optimismSepolia,
  polygonAmoy,
} from "wagmi/chains";

export const IS_TESTNET = process.env.NEXT_PUBLIC_NETWORK === "testnet";

export interface ChainMetadata {
  name: string;
  logo: string;
}

export const CHAIN_METADATA: Record<string, ChainMetadata> = {
  ethereum: {
    name: "Ethereum",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040",
  },
  sepolia: {
    name: "Sepolia",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040",
  },
  base: {
    name: "Base",
    logo: "https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/white/base-symbol-white.png",
  },
  basesepolia: {
    name: "Base Sepolia",
    logo: "https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/white/base-symbol-white.png",
  },
  polygon: {
    name: "Polygon",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png?v=040",
  },
  polygonamoy: {
    name: "Polygon Amoy",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png?v=040",
  },
  solana: {
    name: "Solana",
    logo: "https://cryptologos.cc/logos/solana-sol-logo.png?v=040",
  },
};

export const getChainMetadata = (
  chainName: string,
): ChainMetadata | undefined => {
  return CHAIN_METADATA[chainName.toLowerCase().replace(/\s+/g, "")];
};

export const SUPPORTED_CHAINS = IS_TESTNET
  ? ([
      baseSepolia,
      sepolia,
      arbitrumSepolia,
      optimismSepolia,
      polygonAmoy,
      { id: 501, name: "Solana", network: "solana" } as any,
    ] as const)
  : ([
      base,
      mainnet,
      arbitrum,
      optimism,
      polygon,
      { id: 501, name: "Solana", network: "solana" } as any,
    ] as const);

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

/**
 * Get the RPC URL for a specific chain.
 * Prioritizes environment variables, then falls back to public RPCs.
 */
export const getRpcUrl = (chainId: number): string | undefined => {
  switch (chainId) {
    case base.id:
      return process.env.NEXT_PUBLIC_RPC_BASE;
    case mainnet.id:
      return process.env.NEXT_PUBLIC_RPC_MAINNET;
    case polygon.id:
      return process.env.NEXT_PUBLIC_RPC_POLYGON;
    case baseSepolia.id:
      return process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_RPC_SEPOLIA;
    case polygonAmoy.id:
      return process.env.NEXT_PUBLIC_RPC_POLYGON_AMOY;
    case 501: // Custom ID for Solana
      return IS_TESTNET
        ? process.env.NEXT_PUBLIC_RPC_SOLANA_DEVNET
        : process.env.NEXT_PUBLIC_RPC_SOLANA;
    default:
      return undefined;
  }
};

/**
 * Enhanced getRpcUrl that also handles chain names
 */
export const getRpcUrlByChainName = (chainName: string): string | undefined => {
  const normalized = chainName.toLowerCase();

  if (normalized === "solana") {
    return IS_TESTNET
      ? process.env.NEXT_PUBLIC_RPC_SOLANA_DEVNET
      : process.env.NEXT_PUBLIC_RPC_SOLANA;
  }

  const chainId = getChainId(chainName);
  return chainId ? getRpcUrl(chainId) : undefined;
};

export const getChainId = (chainName: string): number | undefined => {
  const normalized = chainName.toLowerCase().replace(/\s+/g, "");

  // For Solana, we return the custom ID
  if (normalized === "solana") return 501;

  const chainMapping: Record<string, number> = {
    ethereum: mainnet.id,
    sepolia: sepolia.id,
    base: base.id,
    basesepolia: baseSepolia.id,
    polygon: polygon.id,
    polygonamoy: polygonAmoy.id,
  };

  return chainMapping[normalized];
};
