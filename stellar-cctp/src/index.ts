// Constants & config
export {
  STELLAR_DOMAIN,
  ATTESTATION_API,
  STELLAR_RPC,
  STELLAR_NETWORK_PASSPHRASE,
  CCTP_CONTRACTS,
  CCTP_DOMAIN,
} from "./constants";
export type { CctpChain } from "./constants";

// TypeScript types
export type {
  Network,
  StellarCctpConfig,
  BurnParams,
  BurnResult,
  ReceiveParams,
  ReceiveResult,
  AttestationStatus,
  AttestationResponse,
  HookDataRecipient,
} from "./types";

// Hook data (used when building EVM → Stellar CCTP transactions)
export {
  buildCctpForwarderHookData,
  decodeCctpForwarderHookData,
} from "./hook-data";

// Decimal conversion
export {
  toStellarStroops,
  fromStellarStroops,
  toCctpAmount,
  cctpAmountToStellarStroops,
  fromCctpAmount,
  effectiveBurnAmount,
} from "./decimals";

// Circle attestation API
export { fetchAttestation, waitForAttestation } from "./attestation";

// Stellar → EVM  (burn USDC on Stellar, redeem on destination chain)
export { burnUsdcOnStellar } from "./send";

// EVM → Stellar  (claim USDC on Stellar from attested CCTP message)
export { receiveCctpMessage } from "./receive";
