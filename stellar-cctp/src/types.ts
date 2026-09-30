import type { Keypair, Transaction } from "@stellar/stellar-sdk";

export type Network = "mainnet" | "testnet";

export interface StellarCctpConfig {
  network: Network;
  /** Stellar keypair of the transaction signer */
  keypair: Keypair;
  /** Optional: override default Soroban RPC URL */
  rpcUrl?: string;
}

// --- Burn (send FROM Stellar) ---

export interface BurnParams {
  /** Amount in human-readable USDC (e.g. "10.50") */
  amount: string;
  /** CCTP domain of the destination chain */
  destinationDomain: number;
  /** Recipient address on the destination chain, hex-encoded (no 0x prefix, zero-padded to 32 bytes) */
  mintRecipient: string;
}

export interface BurnResult {
  /** Stellar transaction hash */
  txHash: string;
  /** The raw CCTP message bytes emitted (hex, no 0x) */
  message: string;
  /** keccak256 hash of the message — used to fetch the attestation */
  messageHash: string;
  /** Nonce from the MessageTransmitter */
  nonce: bigint;
}

// --- Receive (mint_and_forward on Stellar) ---

export interface ReceiveParams {
  /** Raw CCTP message bytes (hex, no 0x) */
  message: string;
  /** Circle's attestation bytes (hex, no 0x) */
  attestation: string;
}

export interface ReceiveResult {
  /** Stellar transaction hash */
  txHash: string;
  /** Final recipient strkey that received the minted USDC */
  recipient: string;
  /** Amount minted in human-readable USDC (7 decimal places) */
  amount: string;
}

// --- Attestation ---

export type AttestationStatus = "pending_confirmations" | "complete";

export interface AttestationResponse {
  status: AttestationStatus;
  attestation: string | null;
}

// --- Hook data ---

export interface HookDataRecipient {
  /** Stellar strkey — G..., M..., or C... address */
  strkey: string;
}
