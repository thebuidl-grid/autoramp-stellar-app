export type AccountKind = "virtual" | "user_deposit" | "merchant_sub" | "merchant_main";

export interface SafehavenAccount {
  kind: AccountKind;
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
  bankCode: string | null;
  status: string | null;
  userId: string | null;
  userEmail: string | null;
  merchantId: string | null;
  merchantName: string | null;
  transactionId: string | null;
  transactionType: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  events: number;
  lastEventAt: string | null;
  unmatched: number;
}

export interface SafehavenEvent {
  id: string;
  eventType: string | null;
  status: string | null;
  processed: boolean;
  errorMessage: string | null;
  createdAt: string;
  transactionId: string | null;
  reference: string | null;
  amount: string | null;
  creditAccountNumber: string | null;
  debitAccountNumber: string | null;
}

export interface SafehavenTransaction extends SafehavenEvent {
  transactionType: string | null;
  creditAccountName: string | null;
  debitAccountName: string | null;
  sessionId: string | null;
  paymentReference: string | null;
  externalReference: string | null;
  /** Our own reference for the transaction it was tied to, when it was. */
  ourReference: string | null;
}

export interface CctpTransfer {
  /** A user moving USDC between chains, or an off-ramp funded over the relay (Stellar burn, Base mint). Absent on an older backend. */
  kind?: "bridge" | "offramp_relay";
  id: string;
  reference: string;
  fromChain: string;
  toChain: string;
  /** In the token's smallest unit (USDC has 6 decimals). */
  amount: string;
  status: string;
  burnTxHash: string | null;
  sourceAddress: string;
  destinationAddress: string;
  offrampReference: string | null;
  chainNetwork: "mainnet" | "testnet" | null;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  userEmail: string | null;
  merchantId: string | null;
  merchantName: string | null;
  legStatus: string | null;
  legReference: string | null;
  failedStep: string | null;
  failureReason: string | null;
  lastEventAt: string | null;
  legDetails: Record<string, unknown> | null;
}

export interface AdminPage<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

export const KIND_LABEL: Record<AccountKind, string> = {
  virtual: "Virtual account",
  user_deposit: "Customer deposit account",
  merchant_sub: "Merchant sub-account",
  merchant_main: "Merchant main account",
};

/** Who an account belongs to, in words: the merchant's name or the user's email. */
export function accountOwner(a: Pick<SafehavenAccount, "merchantName" | "userEmail" | "merchantId" | "userId">): string | null {
  return a.merchantName ?? a.userEmail ?? (a.merchantId ? "A merchant" : a.userId ? "A user" : null);
}

/** USDC on the bridge is stored in micro-units; shift six places without floats. */
export function bridgeAmount(raw: string | null | undefined, decimals = 6): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** "Base_Sepolia" -> "Base Sepolia". */
export const chainLabel = (chain: string): string => chain.replace(/_/g, " ");

/** The chain names carry the network: Sepolia, Testnet and Devnet are test networks. */
export const isTestChain = (chain: string): boolean => /sepolia|testnet|devnet/i.test(chain);
