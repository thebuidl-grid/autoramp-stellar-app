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
  bsc,
  bscTestnet,
  arcTestnet,
} from "wagmi/chains";

import { getActiveNetwork } from "@/lib/network";

/** Resolved once per page load; switching networks reloads the page. */
export const IS_TESTNET = getActiveNetwork() === "testnet";

export interface ChainMetadata {
  name: string;
  logo: string;
}

/** Arc Testnet chain ID (xReserve-supported source chain alongside Sepolia). */
export const ARC_TESTNET_CHAIN_ID = 5042002 as const;

export const CHAIN_METADATA: Record<string, ChainMetadata> = {
  ethereum: {
    name: "Ethereum",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040",
  },
  sepolia: {
    name: "Sepolia",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040",
  },
  ethereumsepolia: {
    name: "Ethereum Sepolia",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040",
  },
  stellar: {
    name: "Stellar",
    logo: "https://cryptologos.cc/logos/stellar-xlm-logo.png?v=040",
  },
  stellartestnet: {
    name: "Stellar Testnet",
    logo: "https://cryptologos.cc/logos/stellar-xlm-logo.png?v=040",
  },
  solana: {
    name: "Solana",
    logo: "https://cryptologos.cc/logos/solana-sol-logo.png?v=040",
  },
  solanadevnet: {
    name: "Solana Devnet",
    logo: "https://cryptologos.cc/logos/solana-sol-logo.png?v=040",
  },
  arctestnet: {
    name: "Arc Testnet",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=040",
  },
  base: {
    name: "Base",
    logo: "/base-logo.png",
  },
  basesepolia: {
    name: "Base Sepolia",
    logo: "/base-logo.png",
  },
  polygon: {
    name: "Polygon",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png?v=040",
  },
  polygonamoy: {
    name: "Polygon Amoy",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png?v=040",
  },
  bsc: {
    name: "BNB Smart Chain",
    logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=040",
  },
  bnbsmartchain: {
    name: "BNB Smart Chain",
    logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=040",
  },
  bsctestnet: {
    name: "BSC Testnet",
    logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=040",
  },
};

export const getChainMetadata = (
  chainName: string,
): ChainMetadata | undefined => {
  return CHAIN_METADATA[chainName.toLowerCase().replace(/[\s_]+/g, "")];
};

export const SUPPORTED_CHAINS = IS_TESTNET
  ? ([
      base,
      baseSepolia,
      bscTestnet,
      sepolia,
      arcTestnet,
      arbitrumSepolia,
      optimismSepolia,
      polygonAmoy,
    ] as const)
  : ([base, bsc, mainnet, arbitrum, optimism, polygon] as const);

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

/**
 * Chains offered in the Bridge tab, scoped to the active network so the modal
 * never mixes testnet and mainnet (Circle CCTP cannot bridge across networks).
 * Stellar is the D2 destination leg.
 */
export const BRIDGE_CHAINS = {
  testnet: ["Ethereum_Sepolia", "Base_Sepolia", "Solana_Devnet", "Stellar_Testnet"],
  mainnet: ["Ethereum", "Base", "Solana", "Stellar"],
} as const;

export const getBridgeChains = (): string[] =>
  IS_TESTNET ? [...BRIDGE_CHAINS.testnet] : [...BRIDGE_CHAINS.mainnet];

/** True when a chain name refers to Stellar (mainnet or testnet). */
export const isStellarChain = (chain: string): boolean =>
  chain.toLowerCase().includes("stellar");

/** True when a chain name refers to Solana (mainnet or testnet). */
export const isSolanaChain = (chain: string): boolean =>
  chain.toLowerCase().includes("solana");

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
    default:
      return undefined;
  }
};

/**
 * Enhanced getRpcUrl that also handles chain names
 */
export const getRpcUrlByChainName = (chainName: string): string | undefined => {
  const chainId = getChainId(chainName);
  return chainId ? getRpcUrl(chainId) : undefined;
};

/** Solana RPC endpoint for the injected-wallet adapter (Bridge Kit). */
export const getSolanaRpcUrl = (): string =>
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (IS_TESTNET
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com");

export const getChainId = (chainName: string): number | undefined => {
  // Strip spaces AND underscores so BridgeKit-style names resolve:
  // "Ethereum_Sepolia" -> "ethereumsepolia", "Base_Sepolia" -> "basesepolia".
  const normalized = chainName.toLowerCase().replace(/[\s_]+/g, "");

  const chainMapping: Record<string, number> = {
    ethereum: mainnet.id,
    sepolia: sepolia.id,
    ethereumsepolia: sepolia.id,
    arctestnet: ARC_TESTNET_CHAIN_ID,
    base: base.id,
    basesepolia: baseSepolia.id,
    polygon: polygon.id,
    polygonamoy: polygonAmoy.id,
    bsc: bsc.id,
    bnbsmartchain: bsc.id,
    bsctestnet: bscTestnet.id,
  };

  return chainMapping[normalized];
};
