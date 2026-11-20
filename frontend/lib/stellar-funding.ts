import {
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  Horizon,
  Memo,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { IS_TESTNET } from "@/lib/constants/networks";

/**
 * Stellar USDC funding helpers for the off-ramp.
 *
 * Builds a plain USDC `payment` from the connected wallet to the Bitnob
 * funding address, then signs + submits it via the Stellar wallet kit.
 *
 * NOTE: `USDC_ISSUER` defaults to Circle's issuer (testnet/mainnet). Override
 * via NEXT_PUBLIC_STELLAR_USDC_ISSUER if Bitnob expects a different asset.
 */

export const STELLAR_NETWORK_PASSPHRASE = IS_TESTNET
  ? Networks.TESTNET
  : Networks.PUBLIC;

export const STELLAR_HORIZON_URL = IS_TESTNET
  ? "https://horizon-testnet.stellar.org"
  : "https://horizon.stellar.org";

export const STELLAR_USDC_ISSUER =
  process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER ||
  (IS_TESTNET
    ? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZMMFWL5"
    : "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHJAPP5RE34V4R7X2Q");

export interface UsdcFunding {
  destination: string;
  amount: string;
  memo?: string | null;
  assetCode?: string | null;
  assetIssuer?: string | null;
}

/** Pick the right Stellar memo variant from Bitnob's memo/tag string. */
function buildMemo(memo: string): Memo {
  const m = memo.trim();
  if (/^\d{1,20}$/.test(m)) {
    return Memo.id(m);
  }
  if (/^[0-9a-fA-F]{64}$/.test(m)) {
    return Memo.hash(m);
  }
  return Memo.text(m);
}

/** Build (but do not sign) the USDC funding payment, returning its XDR. */
export async function buildUsdcPaymentXdr(
  sourceAddress: string,
  funding: UsdcFunding,
): Promise<string> {
  const server = new Horizon.Server(STELLAR_HORIZON_URL);
  const account = await server.loadAccount(sourceAddress);
  const asset = new Asset(
    funding.assetCode || "USDC",
    funding.assetIssuer || STELLAR_USDC_ISSUER,
  );

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: funding.destination,
        asset,
        amount: funding.amount,
      }),
    )
    .setTimeout(300);

  if (funding.memo) {
    builder.addMemo(buildMemo(funding.memo));
  }

  return builder.build().toXDR();
}

/** Submit an already-signed transaction envelope; returns the tx hash. */
export async function submitSignedXdr(xdr: string): Promise<string> {
  const server = new Horizon.Server(STELLAR_HORIZON_URL);
  const tx = TransactionBuilder.fromXDR(xdr, STELLAR_NETWORK_PASSPHRASE);
  const result = await server.submitTransaction(tx);
  return result.hash;
}
