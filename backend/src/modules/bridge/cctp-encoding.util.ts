import { StrKey } from '@stellar/stellar-sdk';

/**
 * Encodes a Stellar recipient address into the "hook data" format Circle's
 * CctpForwarder Soroban contract expects, so a burn on another chain
 * (via TokenMessengerV2.depositForBurnWithHook) atomically forwards the
 * minted USDC to the right Stellar account/contract once relayed.
 *
 * Layout confirmed against circlefin/stellar-cctp's own reference example
 * (examples/stellar-utils.ts, buildCctpForwarderHookData):
 *   bytes  0-23: zero padding (reserved)
 *   bytes 24-27: hook data version, u32 big-endian, value 0
 *   bytes 28-31: recipient byte length, u32 big-endian
 *   bytes 32+:   the Stellar strkey itself, encoded as UTF-8 text
 *
 * Accepts G... (account), M... (muxed account), or C... (contract)
 * addresses — the three types CctpForwarder knows how to forward to.
 */
export function buildCctpForwarderHookData(stellarAddress: string): string {
  const isAccount = StrKey.isValidEd25519PublicKey(stellarAddress);
  const isMuxed = StrKey.isValidMed25519PublicKey(stellarAddress);
  const isContract = StrKey.isValidContract(stellarAddress);
  if (!isAccount && !isMuxed && !isContract) {
    throw new Error(
      `Invalid Stellar recipient for CCTP hook data: ${stellarAddress} (must be a G..., M..., or C... strkey)`,
    );
  }

  const recipientBytes = Buffer.from(stellarAddress, 'utf8');
  const buffer = Buffer.alloc(32 + recipientBytes.length);
  buffer.writeUInt32BE(0, 24); // version
  buffer.writeUInt32BE(recipientBytes.length, 28);
  recipientBytes.copy(buffer, 32);

  return `0x${buffer.toString('hex')}`;
}

/** The fields of an attested CCTP v2 burn message that decide who gets paid and how much. */
export interface CctpBurnMessage {
  sourceDomain: number;
  destinationDomain: number;
  /** bytes32, lowercase "0x"-prefixed hex */
  burnToken: string;
  /** bytes32, lowercase "0x"-prefixed hex */
  mintRecipient: string;
  /** Burned amount, in the source token's base units */
  amount: bigint;
  /** bytes32, lowercase "0x"-prefixed hex — the account that called depositForBurn */
  messageSender: string;
  /** Fee Circle deducted from `amount` before minting, in base units */
  feeExecuted: bigint;
  /** lowercase "0x"-prefixed hex, "0x" when empty */
  hookData: string;
}

// CCTP v2 layouts (circlefin/evm-cctp-contracts MessageV2.sol / BurnMessageV2.sol).
// Message header: version(4) sourceDomain(4) destinationDomain(4) nonce(32)
// sender(32) recipient(32) destinationCaller(32) minFinalityThreshold(4)
// finalityThresholdExecuted(4), then the message body.
const MESSAGE_BODY_OFFSET = 148;
// Burn message body: version(4) burnToken(32) mintRecipient(32) amount(32)
// messageSender(32) maxFee(32) feeExecuted(32) expirationBlock(32), then hookData.
const BURN_TOKEN = 4;
const MINT_RECIPIENT = 36;
const AMOUNT = 68;
const MESSAGE_SENDER = 100;
const FEE_EXECUTED = 164;
const HOOK_DATA = 228;

/**
 * Decodes the parts of an attested CCTP v2 burn message that matter for
 * paying out against it. Circle's attestation signs these exact bytes, so
 * unlike anything a client reports, they're proof of what was actually
 * burned, by whom, and where the mint lands.
 */
export function decodeCctpV2BurnMessage(messageHex: string): CctpBurnMessage {
  const message = hexToBuffer(messageHex);
  if (message.length < MESSAGE_BODY_OFFSET + HOOK_DATA) {
    throw new Error(`CCTP message too short to be a v2 burn message (${message.length} bytes)`);
  }
  const body = message.subarray(MESSAGE_BODY_OFFSET);
  const bytes32 = (buf: Buffer, offset: number) => `0x${buf.subarray(offset, offset + 32).toString('hex')}`;

  return {
    sourceDomain: message.readUInt32BE(4),
    destinationDomain: message.readUInt32BE(8),
    burnToken: bytes32(body, BURN_TOKEN),
    mintRecipient: bytes32(body, MINT_RECIPIENT),
    amount: BigInt(bytes32(body, AMOUNT)),
    messageSender: bytes32(body, MESSAGE_SENDER),
    feeExecuted: BigInt(bytes32(body, FEE_EXECUTED)),
    hookData: `0x${body.subarray(HOOK_DATA).toString('hex')}`,
  };
}

/** Strips an optional "0x" prefix and returns a Buffer — used for the raw CCTP message/attestation bytes. */
export function hexToBuffer(hex: string): Buffer {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(clean, 'hex');
}

/**
 * Converts a Stellar contract strkey (C...) into the raw 32-byte bytes32 hex
 * CCTP's mintRecipient/destinationCaller fields actually need — the strkey
 * text itself (e.g. "CA66Q2WF...") is NOT valid hex and must never be cast
 * directly; StrKey.decodeContract recovers the underlying 32 bytes the
 * strkey encodes.
 */
export function stellarContractToBytes32(contractAddress: string): string {
  return `0x${StrKey.decodeContract(contractAddress).toString('hex')}`;
}
