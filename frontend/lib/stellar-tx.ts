/**
 * Client-side Stellar transaction building/submission.
 *
 * Counterpart to the backend's StellarService, but for operations the
 * user's own wallet must sign (path payments, trustlines) rather than
 * ones AutoRamp's distribution account signs server-side.
 */
import { Horizon, Asset, TransactionBuilder, Operation, Memo, BASE_FEE } from "@stellar/stellar-sdk";
import { STELLAR_HORIZON_URL, STELLAR_NETWORK_PASSPHRASE } from "./stellar-wallet-config";

export interface StellarAssetInput {
  code: string;
  // Omitted for native XLM.
  issuer?: string;
}

// A Stellar account doesn't exist on the ledger until it's first funded —
// unlike EVM, there's no "just has a zero balance" state. Loading/signing
// against one throws Horizon's NotFoundError (message literally "Not
// Found"), which is exactly what surfaces to a user with a brand-new
// wallet if we don't catch and explain it ourselves.
export const IS_MAINNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet";

let server: Horizon.Server | null = null;
export function getHorizonServer(): Horizon.Server {
  if (!server) server = new Horizon.Server(STELLAR_HORIZON_URL);
  return server;
}

/** Whether an account has been created on-chain yet (funded at least once). */
export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await getHorizonServer().loadAccount(publicKey);
    return true;
  } catch (error: any) {
    if (error?.response?.status === 404) return false;
    throw error;
  }
}

/**
 * Funds a brand-new testnet account via Stellar's public Friendbot (free,
 * no auth, no captcha — testnet only). Throws if called against mainnet,
 * since there's no equivalent there and this must never be offered as a
 * real funding path.
 */
export async function fundTestnetAccount(publicKey: string): Promise<void> {
  if (IS_MAINNET) {
    throw new Error("Friendbot funding is testnet-only");
  }
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Friendbot funding failed: ${body || res.statusText}`);
  }
}

function toAsset(input: StellarAssetInput): Asset {
  // A missing issuer means native XLM — `new Asset('XLM', someIssuer)`
  // would silently build a completely different, non-native issued asset
  // that happens to be named "XLM", not native lumens.
  if (!input.issuer) return Asset.native();
  return new Asset(input.code, input.issuer);
}

export async function buildPathPaymentXdr(params: {
  sourcePublicKey: string;
  sendAsset: StellarAssetInput;
  sendAmount: string;
  destAsset: StellarAssetInput;
  destMin: string;
  destination: string;
  memo?: string;
}): Promise<string> {
  const horizon = getHorizonServer();
  let account;
  try {
    account = await horizon.loadAccount(params.sourcePublicKey);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      throw new Error(
        `Account ${params.sourcePublicKey} doesn't exist on-chain yet — it needs to be funded with XLM before it can send anything.`,
      );
    }
    throw error;
  }

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  }).addOperation(
    Operation.pathPaymentStrictSend({
      sendAsset: toAsset(params.sendAsset),
      sendAmount: params.sendAmount,
      destination: params.destination,
      destAsset: toAsset(params.destAsset),
      destMin: params.destMin,
    })
  );

  if (params.memo) {
    builder.addMemo(Memo.text(params.memo));
  }

  const tx = builder.setTimeout(180).build();
  return tx.toXDR();
}

// Short, human explanations for the Horizon result codes a user is most
// likely to actually hit — https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/result-codes
const RESULT_CODE_EXPLANATIONS: Record<string, string> = {
  op_no_trust: "the receiving account doesn't have a trustline for that asset yet",
  op_no_destination: "the destination account doesn't exist on-chain yet",
  op_underfunded: "the sending account doesn't have enough balance to cover this",
  op_line_full: "the destination's trustline is already at its balance limit for that asset",
  op_too_few_offers: "no matching offers/liquidity were found for this path at execution time (the market may have moved since the quote)",
  op_over_source_max: "the required send amount exceeded the path payment's max, likely because the price moved since the quote",
  op_under_dest_min: "the resulting amount would be below the minimum you approved, likely because the price moved since the quote",
  op_bad_auth: "the transaction wasn't signed by the right account",
  tx_bad_auth: "the transaction wasn't signed correctly — please try again",
  tx_bad_seq: "this transaction's sequence number is stale — please retry",
  tx_insufficient_balance: "the sending account doesn't have enough XLM to cover the fee and minimum balance",
  tx_too_late: "the transaction expired before it could be submitted — please retry",
  tx_failed: "one of the operations in this transaction failed",
};

/**
 * Turns a raw Horizon submission failure into a message that actually says
 * what went wrong. stellar-sdk throws these as a plain AxiosError whose
 * `.message` is just "Request failed with status code 400" — the real
 * reason lives in `response.data.extras.result_codes`, which this pulls
 * out and explains.
 */
export function explainHorizonError(error: any): string {
  const resultCodes = error?.response?.data?.extras?.result_codes;
  if (!resultCodes) return error?.message || "Unknown error";

  const codes: string[] = [resultCodes.transaction, ...(resultCodes.operations || [])].filter(Boolean);
  const explained = codes.map((code) => RESULT_CODE_EXPLANATIONS[code] || code);
  return `Transaction failed: ${explained.join("; ")}`;
}

/**
 * Submits an already-signed transaction XDR and returns its hash.
 * Unlike EVM, Horizon's submitTransaction already waits for ledger
 * inclusion and returns success/failure directly — no separate
 * "wait for receipt" polling step is needed.
 */
export async function submitSignedXdr(signedXdr: string): Promise<string> {
  const horizon = getHorizonServer();
  const tx = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK_PASSPHRASE);
  try {
    const result = await horizon.submitTransaction(tx);
    return result.hash;
  } catch (error: any) {
    throw new Error(explainHorizonError(error));
  }
}
