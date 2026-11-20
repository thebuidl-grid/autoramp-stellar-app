/**
 * Finishing a CCTP transfer after the burn. The user's own wallet is the first choice (they pay the destination fee and nothing
 * touches our relayer). If that wallet is closed, not connected, rejects, or fails, the burn is still safe on chain, so we hand the
 * mint to our relayer straight away instead of leaving the money stuck. The relayer only pays gas; the USDC goes to the recipient in
 * the burn, so falling back can never send funds anywhere else.
 */
export interface CompleteMintOptions {
  /** Mint with the user's own wallet. Omit when no wallet that can do this mint is connected. */
  walletMint?: () => Promise<string>;
  /** Ask our relayer to mint and wait for it. Resolves with the mint hash (empty when it was already minted by someone else). */
  relayMint: () => Promise<string>;
  /** Called once if the wallet could not finish, with why, before the relay takes over. */
  onFallback?: (reason: string) => void;
}

export interface CompleteMintResult {
  hash: string;
  by: "wallet" | "relay";
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "The wallet did not finish the transfer").split("\n")[0].slice(0, 200);

export async function completeMint(o: CompleteMintOptions): Promise<CompleteMintResult> {
  if (o.walletMint) {
    try {
      return { hash: await o.walletMint(), by: "wallet" };
    } catch (e) {
      o.onFallback?.(reasonOf(e));
    }
  }
  return { hash: await o.relayMint(), by: "relay" };
}

export interface RelayPollOptions {
  /** One call to the relay endpoint. */
  call: () => Promise<{ status?: string; mintTxHash?: string }>;
  onMinting?: () => void;
  deadline: number;
  sleep?: (ms: number) => Promise<void>;
  /** Failures in a row before giving up (the burn is already safe, so ride out transient ones). */
  maxFailures?: number;
}

/** Poll the relay until it says complete. 403 (not this user's transfer) is final; other failures are retried a few times. */
export async function pollRelay(o: RelayPollOptions): Promise<string> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = o.maxFailures ?? 5;
  let failures = 0;
  while (Date.now() < o.deadline) {
    let body: { status?: string; mintTxHash?: string };
    try {
      body = await o.call();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (err.response?.status === 403 || ++failures >= max) {
        throw new Error(err.response?.data?.message || `The relay failed (${err.response?.status ?? err.message}). Your burn is safe on chain and can be finished later.`);
      }
      await sleep(5000);
      continue;
    }
    failures = 0;
    if (body.status === "complete") return body.mintTxHash ?? "";
    if (body.status === "minting") o.onMinting?.();
    await sleep(5000);
  }
  throw new Error("Timed out waiting for the relay. Your burn is safe on chain; it will be finished automatically.");
}
