import { TokenInfo } from "../types/swap.types";

export const ADDRESSES = {
  AERODROME: {
    POOL: '0x0206b696a410277ef692024c2b64ccf4eac78589',
    ROUTER: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    QUOTER: '0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0',
    FACTORY: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  },
  // Uniswap V3 style Swap Router (for exactInputSingle)
  SWAP_ROUTER: process.env.SWAP_ROUTER_ADDRESS || '0xCd45aC05fe7C014D6B2F62b3446E2A91D661a236',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  CNGN: '0x46c85152bfe9f96829aa94755d9f915f9b10ef5f',
  WETH: '0x4200000000000000000000000000000000000006',
};

export const TOKENS: Record<string, TokenInfo> = {
  USDC: { address: ADDRESSES.USDC, symbol: 'USDC', decimals: 6 },
  CNGN: { address: ADDRESSES.CNGN, symbol: 'CNGN', decimals: 6 },
};
