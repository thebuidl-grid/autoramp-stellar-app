/**
 * RampProcessor
 *
 * Abstraction over the NGN bank-rail leg (currently Flint, via
 * FlintRampProcessor). StablestackService orchestrates DB records, Stellar
 * memos/collection accounts, etc. against this interface instead of
 * talking to Flint's HTTP API directly — so a second/alternate processor
 * can be swapped in (Flint's Stellar support is unverified — see
 * FlintRampProcessor) without touching StablestackService, SwapService,
 * WebhookService, or any controller.
 *
 * Note: there's no RAMP_PROCESSOR DI token/symbol — processors are always
 * resolved lazily via RampProcessorRegistry (per-corridor, or the
 * app-wide default), never constructed eagerly at app boot. See
 * StablestackModule's doc comment for why that distinction matters.
 */

/**
 * A single RampProcessor instance (e.g. Paystack) can serve more than one
 * corridor — AutoRamp's own Paystack account handles NG/NGN, GH/GHS, and
 * KE/KES, which need different bank-list country params, recipient types,
 * and currency codes on every call. Processors that only ever serve one
 * corridor (Flint, SafeHaven — both NGN-only today) can ignore this.
 */
export interface RampProcessorCorridorContext {
  currency?: string; // ISO 4217, e.g. 'NGN' | 'GHS'
  countryCode?: string; // ISO 3166-1 alpha-2, e.g. 'NG' | 'GH'
}

export interface RampProcessorTransaction {
  /** The processor's own transaction ID, if it returns one (e.g. Flint's flintTransactionId). */
  providerTransactionId: string | null;
  depositAccount?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  } | null;
  /**
   * How the user completes THIS onramp — defaults to the bank-transfer/
   * deposit-account UI (depositAccount above) when omitted. 'mobile_money_push'
   * means there's no account to display: the processor pushes a PIN prompt
   * straight to the user's phone (e.g. Paystack's M-Pesa Charge API for
   * KES) — see PaystackRampProcessor.initiateMobileMoneyCharge.
   */
  collectionMethod?: 'bank_transfer' | 'mobile_money_push';
  /** Customer-facing instructions for collectionMethod 'mobile_money_push' (e.g. Paystack's `display_text`). */
  displayMessage?: string;
  /** Original provider response envelope, preserved so callers can keep exposing provider-specific fields. */
  raw: any;
}

export interface RampProcessor {
  getBanks(params?: RampProcessorCorridorContext): Promise<any>;
  resolveAccount(
    bankCode: string,
    accountNumber: string,
    params?: RampProcessorCorridorContext,
  ): Promise<any>;
  initiateOnramp(params: {
    reference: string;
    amount: number;
    destinationAddress: string;
    notifyUrl?: string;
    /**
     * Needed by processors built around a persistent per-customer deposit
     * account (e.g. Paystack's Dedicated Virtual Accounts) rather than a
     * fresh one-time deposit address per transaction (Flint's model).
     * FlintRampProcessor ignores it.
     */
    userEmail?: string;
    /**
     * Needed by processors that collect via a direct push-to-phone prompt
     * instead of a deposit account (e.g. Paystack's M-Pesa Charge API for
     * KES). Ignored by processors that don't need it.
     */
    phoneNumber?: string;
  } & RampProcessorCorridorContext): Promise<RampProcessorTransaction>;
  /**
   * Actually moves fiat to the user's bank account — call this ONLY after
   * the corresponding crypto deposit is confirmed on-chain (see
   * StablestackService.completeDepositIfMemoMatched). It is named
   * "execute", not "initiate", specifically because for SafeHaven and
   * Paystack this hits their real transfer endpoint synchronously; calling
   * it at offramp *creation* time (the original bug this fixed) would pay
   * users out before they ever sent the crypto.
   */
  executeOfframpPayout(params: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    notifyUrl?: string;
  } & RampProcessorCorridorContext): Promise<RampProcessorTransaction>;
  /**
   * Re-derive the authoritative status of a transaction from the
   * processor's own API, keyed by whatever identifier a webhook delivered.
   * Only meaningful for processors whose webhook payloads can't be trusted
   * on their own — e.g. no documented signature scheme (SafeHaven, as of
   * this writing). Flint/Paystack verify their webhooks by signature
   * instead and don't implement this.
   */
  verifyStatus?(params: { sessionId?: string; paymentReference?: string }): Promise<{
    kind: 'onramp' | 'offramp';
    reference: string | null;
    completed: boolean;
    failed: boolean;
    raw: any;
  } | null>;
}
