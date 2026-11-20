/**
 * Stacks address encoding for xReserve `depositToRemote`.
 *
 * Stacks `remoteRecipient` = 11 zero bytes + 1 version byte + 20 hash bytes (bytes32).
 * `hookData` = "0x" (empty) — Circle's xReserve routes solely via `remoteRecipient`.
 *
 * Uses @stacks/transactions for address parsing + micro-packed for bytes layout,
 * matching Circle's official Stacks quickstart.
 */
import * as P from "micro-packed";
import {
  createAddress,
  addressToString,
  AddressVersion,
  StacksWireType,
} from "@stacks/transactions";
import { hex } from "@scure/base";
import { pad, toHex, type Hex } from "viem";

export const remoteRecipientCoder = P.wrap<string>({
  encodeStream(w, value: string) {
    const address = createAddress(value);
    P.bytes(11).encodeStream(w, new Uint8Array(11).fill(0));
    P.U8.encodeStream(w, address.version);
    P.bytes(20).encodeStream(w, hex.decode(address.hash160));
  },
  decodeStream(r) {
    P.bytes(11).decodeStream(r);
    const version = P.U8.decodeStream(r);
    const hash = P.bytes(20).decodeStream(r);
    return addressToString({
      hash160: hex.encode(hash),
      version: version as AddressVersion,
      type: StacksWireType.Address,
    });
  },
});

export function bytes32FromBytes(bytes: Uint8Array): Hex {
  return toHex(pad(bytes, { size: 32 }));
}

/** Lightweight Stacks address check (full validation happens in encode). */
export function isStacksAddress(value: string): boolean {
  const v = value.trim();
  return /^(ST|SP)[0-9A-Z]{37,39}$/.test(v);
}

/**
 * Build `remoteRecipient` (bytes32) + `hookData` (empty bytes, "0x")
 * for xReserve depositToRemote to Stacks.
 *
 * Per Circle's xReserve docs, hookData must be empty ("0x") for Stacks deposits.
 * The remoteRecipient bytes32 carries all routing information.
 */
export function encodeStacksDepositParams(stacksRecipient: string): {
  remoteRecipient: Hex;
  hookData: Hex;
} {
  const recipient = stacksRecipient.trim();
  if (!isStacksAddress(recipient)) {
    throw new Error(
      "Invalid Stacks address. Expected testnet address starting with ST... or SP... (e.g. ST1...).",
    );
  }
  const remoteRecipient = bytes32FromBytes(
    remoteRecipientCoder.encode(recipient),
  );
  return { remoteRecipient, hookData: "0x" };
}
