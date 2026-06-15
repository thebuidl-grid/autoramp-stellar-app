import type { HookDataRecipient } from "./types";

/**
 * Builds the hookData payload required when calling depositForBurnWithHook
 * on an EVM chain targeting Stellar as the destination.
 *
 * Layout (from Circle CCTP Stellar docs):
 *   bytes  0-23  reserved magic (zeros)
 *   bytes 24-27  version uint32 BE (0)
 *   bytes 28-31  forwardRecipient length uint32 BE
 *   bytes 32+    forwardRecipient as UTF-8 strkey (G/M/C prefix)
 *
 * ⚠️  mintRecipient AND destinationCaller on the EVM side must both be set
 *     to the CctpForwarder contract address. Misconfiguring either causes
 *     permanent fund loss.
 */
export function buildCctpForwarderHookData(
  recipient: HookDataRecipient | string,
): `0x${string}` {
  const strkey =
    typeof recipient === "string" ? recipient : recipient.strkey;

  if (!isValidStellarStrkey(strkey)) {
    throw new Error(
      `Invalid Stellar strkey: "${strkey}". Must start with G, M, or C.`,
    );
  }

  const recipientBytes = Buffer.from(strkey, "utf8");
  const hookData = Buffer.alloc(32 + recipientBytes.length);

  // bytes 0-23: zeros (reserved magic) — Buffer.alloc initialises to 0
  // bytes 24-27: version = 0
  hookData.writeUInt32BE(0, 24);
  // bytes 28-31: length of forwardRecipient
  hookData.writeUInt32BE(recipientBytes.length, 28);
  // bytes 32+: forwardRecipient UTF-8
  recipientBytes.copy(hookData, 32);

  return `0x${hookData.toString("hex")}`;
}

/**
 * Decodes hookData back into the forward recipient strkey.
 * Useful for verifying hook data before submitting a burn transaction.
 */
export function decodeCctpForwarderHookData(hookData: string): string {
  const hex = hookData.startsWith("0x") ? hookData.slice(2) : hookData;
  const buf = Buffer.from(hex, "hex");

  if (buf.length < 32) {
    throw new Error("hookData too short — must be at least 32 bytes");
  }

  const recipientLength = buf.readUInt32BE(28);

  if (buf.length < 32 + recipientLength) {
    throw new Error("hookData truncated — recipient bytes missing");
  }

  return buf.slice(32, 32 + recipientLength).toString("utf8");
}

function isValidStellarStrkey(strkey: string): boolean {
  return (
    typeof strkey === "string" &&
    strkey.length > 0 &&
    (strkey.startsWith("G") ||
      strkey.startsWith("M") ||
      strkey.startsWith("C"))
  );
}
