/**
 * Circle CCTP v2 -> Stellar helpers (pure, no wallet/network access).
 *
 * Why this exists: @circle-fin/bridge-kit (<= 1.17.1) has no Stellar chain, so
 * EVM -> Stellar transfers are built directly on CCTP v2:
 *   1. EVM:  TokenMessengerV2.depositForBurnWithHook(destDomain 27,
 *            mintRecipient = destinationCaller = CctpForwarder, hookData = G… recipient)
 *   2. Iris: wait for Circle's attestation of the burn
 *   3. Stellar: CctpForwarder.mint_and_forward(message, attestation) — publicly
 *            callable, so a relayer can submit it; funds go to the hook recipient.
 * Spec: https://developers.circle.com/cctp/references/stellar
 */
import { StrKey } from "@stellar/stellar-sdk";

/** CCTP domain id of Stellar (mainnet and testnet). */
export const STELLAR_CCTP_DOMAIN = 27;

/** Circle's CctpForwarder Soroban contract per network. */
export const STELLAR_CCTP_FORWARDER = {
  testnet: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ",
  mainnet: "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T",
} as const;

/** CCTP source-domain id for the EVM chains the app can bridge from. */
export const CCTP_SOURCE_DOMAIN: Record<number, number> = {
  1: 0, // Ethereum
  11155111: 0, // Ethereum Sepolia
  8453: 6, // Base
  84532: 6, // Base Sepolia
};

/** Fast transfer (<= 1000) / standard (>= 2000) finality thresholds. */
export const CCTP_FAST_FINALITY = 1000;
/** Fee ceiling for a fast transfer, in USDC base units (6 dp) = 0.005 USDC. */
export const CCTP_MAX_FEE = BigInt(5000);

export const DEPOSIT_FOR_BURN_WITH_HOOK_ABI = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/** Decode a Stellar contract strkey (C…) to the 0x-prefixed bytes32 CCTP expects. */
export function contractStrkeyToBytes32(strkey: string): `0x${string}` {
  if (!StrKey.isValidContract(strkey)) {
    throw new Error(`Invalid Stellar contract address: ${strkey}`);
  }
  return `0x${Buffer.from(StrKey.decodeContract(strkey)).toString("hex")}`;
}

/**
 * Forwarder hook data:
 *   bytes 0–23 zero | 24–27 version (u32 BE = 0) | 28–31 recipient length (u32 BE) | 32+ recipient strkey (UTF-8)
 * Only G… accounts are accepted here (they need a USDC trustline to receive).
 */
export function buildForwarderHookData(recipient: string): `0x${string}` {
  if (!StrKey.isValidEd25519PublicKey(recipient)) {
    throw new Error("Stellar destination must be a valid G… account address");
  }
  const rb = Buffer.from(recipient, "utf8");
  const buf = Buffer.alloc(32 + rb.length);
  buf.writeUInt32BE(0, 24);
  buf.writeUInt32BE(rb.length, 28);
  rb.copy(buf, 32);
  return `0x${buf.toString("hex")}`;
}

/** Block-explorer URLs used for evidence links. */
export const stellarTxUrl = (hash: string, testnet: boolean) =>
  `https://stellar.expert/explorer/${testnet ? "testnet" : "public"}/tx/${hash}`;

// ---------------------------------------------------------------------------
// Stellar as a CCTP *source* (Stellar -> EVM). Spec + addresses:
// https://developers.circle.com/cctp/references/stellar-contracts
// ---------------------------------------------------------------------------

/** Circle's USDC issuer on Stellar, per network (its SAC is the CCTP burn token). */
export const STELLAR_USDC_ISSUER = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  mainnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
} as const;

/** Soroban `TokenMessengerMinter` (burn + mint on Stellar). */
export const STELLAR_TOKEN_MESSENGER_MINTER = {
  testnet: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",
  mainnet: "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL",
} as const;

/** EVM `MessageTransmitterV2` (same address on every EVM chain of a network). */
export const EVM_MESSAGE_TRANSMITTER_V2 = {
  testnet: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  mainnet: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
} as const;

/** CCTP domain id per EVM chain id (destination of a Stellar burn). */
export const CCTP_EVM_DOMAIN = CCTP_SOURCE_DOMAIN;

export const RECEIVE_MESSAGE_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

/** 20-byte EVM address -> left-padded bytes32 (CCTP `mintRecipient`). */
export function evmAddressToBytes32(address: string): Buffer {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }
  return Buffer.concat([Buffer.alloc(12), Buffer.from(address.slice(2), "hex")]);
}
