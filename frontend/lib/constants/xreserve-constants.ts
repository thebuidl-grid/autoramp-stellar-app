/**
 * xReserve Constants
 *
 * Circle xReserve USDC -> USDCx deposits.
 * The active network is read from NEXT_PUBLIC_NETWORK (see ./networks):
 *  - testnet: sources Ethereum Sepolia / Arc Testnet -> Stacks Testnet
 *  - mainnet: source Ethereum -> Stacks Mainnet
 * Docs: https://developers.circle.com/xreserve/quickstart-deposit
 */

import { IS_TESTNET } from "./networks";

export const XRESERVE_CONTRACT_SEPOLIA =
  "0x008888878f94C0d87defdf0B07f46B93C1934442" as const;

export const SEPOLIA_USDC =
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

/** xReserve mainnet contract (Ethereum + Arc mainnet sources). */
export const XRESERVE_MAINNET_CONTRACT =
  "0x8888888199b2Df864bf678259607d6D5EBb4e3Ce" as const;

/** Ethereum mainnet USDC. */
export const ETHEREUM_USDC_MAINNET =
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;

/** Stacks remote domain — constant for all networks (testnet + mainnet). */
export const XRESERVE_STACKS_DOMAIN = 10003 as const;
export const XRESERVE_SEPOLIA_CHAIN_ID = 11155111 as const;
export const XRESERVE_ARC_TESTNET_CHAIN_ID = 5042002 as const;
export const XRESERVE_ETHEREUM_CHAIN_ID = 1 as const;
export const XRESERVE_ETHEREUM_DOMAIN = 0 as const;
export const XRESERVE_ARC_DOMAIN = 26 as const;

export interface XReserveSourceChainConfigEntry {
  usdcAddress: `0x${string}`;
  usdcDecimals: number;
  xreserveAddress: `0x${string}`;
}

/**
 * USDC contract addresses per source chain (by network).
 */
export const XRESERVE_SOURCE_CHAIN_CONFIG_TESTNET = {
  [XRESERVE_SEPOLIA_CHAIN_ID]: {
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const,
    usdcDecimals: 6,
    xreserveAddress: "0x008888878f94C0d87defdf0B07f46B93C1934442" as const,
  },
  [XRESERVE_ARC_TESTNET_CHAIN_ID]: {
    usdcAddress: "0x3600000000000000000000000000000000000000" as const,
    usdcDecimals: 6,
    xreserveAddress: "0x008888878f94C0d87defdf0B07f46B93C1934442" as const,
  },
} as const;

export const XRESERVE_SOURCE_CHAIN_CONFIG_MAINNET = {
  [XRESERVE_ETHEREUM_CHAIN_ID]: {
    usdcAddress: ETHEREUM_USDC_MAINNET,
    usdcDecimals: 6,
    xreserveAddress: XRESERVE_MAINNET_CONTRACT,
  },
} as const;

export const XRESERVE_SOURCE_CHAIN_CONFIG: Record<
  number,
  XReserveSourceChainConfigEntry
> = IS_TESTNET
  ? XRESERVE_SOURCE_CHAIN_CONFIG_TESTNET
  : XRESERVE_SOURCE_CHAIN_CONFIG_MAINNET;

export interface XReserveSourceChain {
  chainId: number;
  label: string;
  key: string;
}

/**
 * EVM source chains supported by xReserve.
 *  - testnet: Ethereum Sepolia and Arc Testnet (Base Sepolia is NOT supported)
 *  - mainnet: Ethereum
 */
export const XRESERVE_SUPPORTED_SOURCE_CHAINS: readonly XReserveSourceChain[] =
  IS_TESTNET
    ? [
        { chainId: XRESERVE_SEPOLIA_CHAIN_ID, label: "Sepolia", key: "sepolia" },
        {
          chainId: XRESERVE_ARC_TESTNET_CHAIN_ID,
          label: "Arc Testnet",
          key: "arctestnet",
        },
      ]
    : [
        {
          chainId: XRESERVE_ETHEREUM_CHAIN_ID,
          label: "Ethereum",
          key: "ethereum",
        },
      ];

export type XReserveSourceChainId = number;

/** Source chain used when the wallet is not already on a supported one. */
export const XRESERVE_DEFAULT_SOURCE_CHAIN_ID: XReserveSourceChainId =
  IS_TESTNET ? XRESERVE_SEPOLIA_CHAIN_ID : XRESERVE_ETHEREUM_CHAIN_ID;

// Stacks USDCx contracts (SIP-010). Burn entrypoint: <addr>.usdcx-v1 burn(amount, native-domain, native-recipient)
// Docs: https://docs.stacks.co/more-guides/bridging-usdcx
//
// IMPORTANT (Aug 2026 Stacks testnet reset): xReserve redelployed USDCx at a
// NEW address and deregistered the old `ST1PQHQKV0...` deployment
// (Circle release note 2026.08.14 + supported-blockchains page). Verified
// live: recent deposit recipients hold balances on `ST2WK9...usdcx`, while
// `ST1PQHQKV0...usdcx` receives no mints. Burns MUST target the new contract
// or Circle's attestation service never settles them.
export const STACKS_USDCX_TESTNET = {
  address: "ST2WK9SGBJ15RHZ33KK0KYVSXBEBHM1XDM8C96EC4",
  contractName: "usdcx-v1",
  tokenContract: "ST2WK9SGBJ15RHZ33KK0KYVSXBEBHM1XDM8C96EC4.usdcx",
  tokenName: "usdcx-token",
  network: "testnet",
} as const;

/** Hiro testnet API (CORS-enabled) — used to watch USDCx mint arrival. */
export const HIRO_TESTNET_API_BASE = "https://api.testnet.hiro.so" as const;

/** Hiro mainnet API (CORS-enabled) — used to watch USDCx mint arrival. */
export const HIRO_MAINNET_API_BASE = "https://api.hiro.so" as const;

export const STACKS_USDCX_MAINNET = {
  address: "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE",
  contractName: "usdcx-v1",
  tokenContract: "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx",
  tokenName: "usdcx-token",
  network: "mainnet",
} as const;

/** Active Stacks USDCx contract for the configured network. */
export const STACKS_USDCX = IS_TESTNET
  ? STACKS_USDCX_TESTNET
  : STACKS_USDCX_MAINNET;

/** Active Hiro API base for the configured network. */
export const HIRO_API_BASE = IS_TESTNET
  ? HIRO_TESTNET_API_BASE
  : HIRO_MAINNET_API_BASE;

/** Network segment used by the USDCx API (`/mainnet/...` or `/testnet/...`). */
export const XRESERVE_API_NETWORK: "mainnet" | "testnet" = IS_TESTNET
  ? "testnet"
  : "mainnet";

export const STACKS_USDCX_API_BASE = "https://api.usdc-on-stacks.com" as const;

/**
 * Circle xReserve attestation API (CORS `*`) — keyed by source tx hash.
 * Fallback source for deposit status when the USDCx deposits API is
 * unavailable (its `/mainnet/deposits` route currently 400s).
 * Docs: https://developers.circle.com/api-reference/xreserve
 */
export const CIRCLE_XRESERVE_API_BASE = IS_TESTNET
  ? "https://xreserve-api-testnet.circle.com"
  : "https://xreserve-api.circle.com";
export const USDCX_DECIMALS = 6 as const;

/**
 * Peg-out (USDCx burn → USDC on Ethereum) economics, verified live 2026-09-26:
 *  - `usdcx-v1.get-min-withdrawal-amount` → u4800000 (4.80 USDCx) on mainnet.
 *  - A 10.00 USDCx burn settled 8.00 USDC on Ethereum → 2.00 USDC protocol
 *    fee, deducted off-chain before Circle attests (Stacks docs still quote
 *    ~$4.80, so always present the fee as ≈).
 */
export const PEG_OUT_FEE_USDC = 2;
export const PEG_OUT_MIN_USDCX = 4.8;

export const X_RESERVE_ABI = [
  {
    name: "depositToRemote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "value", type: "uint256" },
      { name: "remoteDomain", type: "uint32" },
      { name: "remoteRecipient", type: "bytes32" },
      { name: "localToken", type: "address" },
      { name: "maxFee", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
