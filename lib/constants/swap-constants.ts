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
  USDC_DECIMALS: 6,
  CNGN_DECIMALS: 6,
  USDT_DECIMALS: 6,
  ZEROEX_EXCHANGE_PROXY: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
  ZEROEX_API_URL: "https://base.api.0x.org/swap/v1",
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
