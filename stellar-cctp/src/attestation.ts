import { ATTESTATION_API } from "./constants";
import type { AttestationResponse, Network } from "./types";

/**
 * Fetches the Circle attestation for a CCTP message.
 *
 * @param messageHash keccak256 hash of the CCTP message bytes (hex with 0x prefix)
 * @param network     "mainnet" or "testnet"
 */
export async function fetchAttestation(
  messageHash: string,
  network: Network,
): Promise<AttestationResponse> {
  const base = ATTESTATION_API[network];
  const hash = messageHash.startsWith("0x")
    ? messageHash
    : `0x${messageHash}`;

  const res = await fetch(`${base}/v1/attestations/${hash}`);

  if (!res.ok) {
    throw new Error(
      `Attestation API error: ${res.status} ${res.statusText}`,
    );
  }

  const body = await res.json();

  return {
    status: body.status,
    attestation: body.attestation ?? null,
  };
}

/**
 * Polls the Circle attestation API until the attestation is available or the
 * timeout is reached.
 *
 * @param messageHash keccak256 hash of the CCTP message (with 0x prefix)
 * @param network     "mainnet" or "testnet"
 * @param opts.intervalMs   how often to poll (default 5 000 ms)
 * @param opts.timeoutMs    give up after this many ms (default 20 minutes)
 * @param opts.onPending    optional callback fired on each pending poll
 */
export async function waitForAttestation(
  messageHash: string,
  network: Network,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    onPending?: (attempt: number) => void;
  } = {},
): Promise<string> {
  const { intervalMs = 5_000, timeoutMs = 20 * 60 * 1_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    const { status, attestation } = await fetchAttestation(messageHash, network);

    if (status === "complete" && attestation) {
      return attestation;
    }

    attempt++;
    opts.onPending?.(attempt);

    if (Date.now() + intervalMs > deadline) break;

    await sleep(intervalMs);
  }

  throw new Error(
    `Attestation not available after ${timeoutMs / 1_000}s for message ${messageHash}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
