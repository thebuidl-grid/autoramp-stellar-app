import { IS_TESTNET } from "./networks";

// Base network contract addresses
export const SWAP_CONSTANTS = {
  USDC: IS_TESTNET
    ? "0x036cbd53842c5426634e7929541ec2318f3dcf7e" // Base Sepolia USDC
    : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet USDC
  CNGN: IS_TESTNET
    ? "0x401306c9b05ddd6aaa6758066fb9d796783a0963" // Base Sepolia CNGN (example)
    : "0x46c85152bfe9f96829aa94755d9f915f9b10ef5f", // Base Mainnet CNGN
  USDT: IS_TESTNET
    ? "0x560866166cd34ba4854f3ba2eb87771b7c13cc92" // Base Sepolia USDT (example)
    : "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Base Mainnet USDT
  WETH: IS_TESTNET
    ? "0x4200000000000000000000000000000000000006" // Base Sepolia WETH
    : "0x4200000000000000000000000000000000000006", // Base Mainnet WETH
  USDC_DECIMALS: 6,
  CNGN_DECIMALS: 6,
  USDT_DECIMALS: 6,
  WETH_DECIMALS: 18,
  ZEROEX_EXCHANGE_PROXY: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
  ZEROEX_API_URL: "https://base.api.0x.org/swap/v1",
} as const;

// BSC token contract addresses
export const BSC_CONSTANTS = {
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  CNGN: "0xceb12d0604a9b814ee9a6c235537d5a19de69e9b",
  USDC_DECIMALS: 18,
  USDT_DECIMALS: 18,
  CNGN_DECIMALS: 18,
} as const;

// OTC token addresses by network name
export const OTC_TOKEN_ADDRESSES: Record<string, Record<string, { address: string; decimals: number }>> = {
  Base: {
    USDC: { address: SWAP_CONSTANTS.USDC, decimals: SWAP_CONSTANTS.USDC_DECIMALS },
    USDT: { address: SWAP_CONSTANTS.USDT, decimals: SWAP_CONSTANTS.USDT_DECIMALS },
    CNGN: { address: SWAP_CONSTANTS.CNGN, decimals: SWAP_CONSTANTS.CNGN_DECIMALS },
  },
  BSC: {
    USDC: { address: BSC_CONSTANTS.USDC, decimals: BSC_CONSTANTS.USDC_DECIMALS },
    USDT: { address: BSC_CONSTANTS.USDT, decimals: BSC_CONSTANTS.USDT_DECIMALS },
    CNGN: { address: BSC_CONSTANTS.CNGN, decimals: BSC_CONSTANTS.CNGN_DECIMALS },
  },
} as const;

// ERC20 ABI for approve, allowance, and balanceOf
export const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
