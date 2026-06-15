// Circle CCTP Stellar domain ID (same for mainnet and testnet)
export const STELLAR_DOMAIN = 27;

// Circle attestation API base URLs
export const ATTESTATION_API = {
  mainnet: "https://iris-api.circle.com",
  testnet: "https://iris-api-sandbox.circle.com",
} as const;

// Stellar RPC endpoints
export const STELLAR_RPC = {
  mainnet: "https://mainnet.sorobanrpc.com",
  testnet: "https://soroban-testnet.stellar.org",
} as const;

// Stellar network passphrases
export const STELLAR_NETWORK_PASSPHRASE = {
  mainnet: "Public Global Stellar Network ; September 2015",
  testnet: "Test SDF Network ; September 2015",
} as const;

// Circle CCTP Soroban contract addresses
export const CCTP_CONTRACTS = {
  mainnet: {
    tokenMessengerMinter: "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL",
    messageTransmitter: "CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV",
    cctpForwarder: "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T",
    usdc: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  },
  testnet: {
    tokenMessengerMinter: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",
    messageTransmitter: "CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY",
    cctpForwarder: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ",
    // Testnet USDC contract — Circle-issued on Stellar testnet
    usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  },
} as const;

// CCTP domain IDs for supported EVM/Solana chains (used when sending FROM Stellar)
export const CCTP_DOMAIN = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  noble: 4,
  solana: 5,
  base: 6,
  polygon: 7,
  sui: 8,
  aptos: 9,
  stellar: 27,
} as const;

export type CctpChain = keyof typeof CCTP_DOMAIN;
