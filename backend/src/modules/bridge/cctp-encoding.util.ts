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
