import axios, { AxiosError } from "axios";

/**
 * API Configuration
 *
 * Base API client for communicating with the backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Create axios instance with default config
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear token and auth storage
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("auth-storage");
        // Only redirect if not already on auth page
        if (!window.location.pathname.startsWith("/auth") && window.location.pathname !== "/") {
          window.location.href = "/";
        }
      }
    }
    return Promise.reject(error);
  },
);

// API Error type
export interface ApiError {
  statusCode: number;
  message: string;
  timestamp?: string;
  method?: string;
}

// Extract error message from API response
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError;
    return apiError?.message || error.message || "An error occurred";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

// ============== Auth API ==============

export interface SignUpDto {
  email: string;
  otpCode: string;
  walletAddress?: string;
}

export interface SendOtpDto {
  email: string;
  purpose?: string;
}

export interface VerifyOtpDto {
  email: string;
  code: string;
  purpose?: string;
}

export interface SignInDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: string;
  };
  accessToken: string;
}

export const authApi = {
  signUp: (data: SignUpDto) =>
    api.post<AuthResponse>("/auth/signup", data),

  signIn: (data: SignInDto) =>
    api.post<AuthResponse>("/auth/signin", data),

  adminLogin: (data: SignInDto) =>
    api.post<AuthResponse>("/auth/admin/login", data),

  sendOtp: (data: SendOtpDto) =>
    // devOtpCode is only present when the backend opts in via
    // OTP_DEV_RETURN_CODE=true (never in production) and email delivery
    // fails (see backend OtpService.sendOtp) — lets
    // the sign-up flow still be tested end-to-end locally.
    api.post<{ success: boolean; message: string; devOtpCode?: string }>(
      "/auth/otp/send",
      data
    ),

  verifyOtp: (data: VerifyOtpDto) =>
    api.post<{ success: boolean; message: string }>("/auth/otp/verify", data),
};

// ============== User API ==============

export interface User {
  id: string;
  email: string;
  phoneNumber?: string;
  walletAddress?: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export const userApi = {
  getProfile: () =>
    api.get<User>("/user/profile"),

  // User API Keys
  getUserApiKeys: () => api.get<ApiKey[]>("/user/api-keys"),

  createApiKey: (data: CreateApiKeyDto) =>
    api.post<CreateApiKeyResponse>("/user/api-keys", data),

  getUserApiKeyStats: () =>
    api.get<UserApiKeyStatsResponse>("/user/api-keys/stats"),

  getUserApiKeyAnalytics: (period: "daily" | "weekly" | "monthly" = "daily") =>
    api.get<UserApiKeyAnalyticsDataPoint[]>(
      `/user/api-keys/analytics?period=${period}`,
    ),
};

// ============== API Keys API ==============

export interface ApiKey {
  id: string;
  keyPrefix: string;
  name?: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
  user?: {
    id: string;
    email: string;
  };
}

export interface CreateApiKeyDto {
  name?: string;
  businessName?: string;
  trafficEstimate?: string;
  requestLimit?: string;
}

export interface CreateApiKeyResponse extends ApiKey {
  key: string;
  message: string;
}

export interface TransactionsSummaryResponse {
  totalVolume: number;
  totalCount: number;
  successRate: number;
  averageValue: number;
  onrampCompletedVolume: number;
  onrampCompletedCount: number;
  offrampCompletedVolume: number;
  offrampCompletedCount: number;
  swapCompletedVolume: number;
  swapCompletedCount: number;
  unsuccessfulVolume: number;
  unsuccessfulCount: number;
}

export interface TransactionAnalyticsDataPoint {
  date: string;
  onrampCount: number;
  offrampCount: number;
  swapCount: number;
  totalCount: number;
}

export interface ApiKeysResponse {
  apiKeys: ApiKey[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiKeysSummaryResponse {
  totalKeys: number;
  activeKeys: number;
  totalRequests: number;
  averageRequestsPerKey: number;
}

export interface ApiKeyAnalyticsDataPoint {
  date: string;
  requestCount: number;
  uniqueKeys: number;
  successCount: number;
  errorCount: number;
  successRate: number;
}

export interface UserApiKeyStatsResponse {
  totalKeys: number;
  activeKeys: number;
  totalRequests: number;
  lastRequestAt: string | null;
}

export interface UserApiKeyAnalyticsDataPoint {
  date: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  successRate: number;
}

// ============== Stablestack API ==============

export interface Bank {
  institutionCode: string;
  institutionName: string;
}

export interface OnRampDto {
  network: string;
  type?: string;
  amount: number;
  destination: {
    address: string;
    // Required only when the corridor's onrampCollectionMethod is
    // 'mobile_money' (see Corridor below) — the payer's phone for the
    // M-Pesa STK push, e.g. '+254712345678'.
    phoneNumber?: string;
  };
  // Fiat currency (ISO 4217) — selects the corridor. Defaults to 'NGN'.
  currency?: string;
  // Chain to deliver the purchased stablecoin on (e.g. 'base', 'ethereum').
  // Defaults to 'stellar' — today's only behavior when payoutTokenCode is
  // also unset.
  payoutChain?: string;
  // Stablecoin to deliver — a corridor code (Stellar), a ChainToken code
  // (EVM payoutChain), or 'USDC'. Defaults to the corridor's own stablecoin.
  payoutTokenCode?: string;
}

export interface OffRampDto {
  network: string;
  type?: string;
  amount: number;
  destination: {
    bankCode: string;
    accountNumber: string;
  };
  // Fiat currency (ISO 4217) — selects the corridor. Defaults to 'NGN'.
  currency?: string;
}

export interface Transaction {
  id: string;
  userId: string; // Added based on TransactionDto
  reference: string;
  status: string;
  transactionType: "onramp" | "offramp" | "swap"; // Added based on TransactionDto

  createdAt: string; // Use string for dates from API
  updatedAt: string; // Use string for dates from API
  completedAt?: string; // Use string for dates from API

  // On-ramp specific fields (combined from existing Transaction and TransactionDto)
  amount?: number; // On-ramp amount in NGN
  currency?: string;
  tokenAmount?: number; // On-ramp token amount in CNGN
  destinationAddress?: string; // Destination address for on-ramp
  flintTransactionId?: string;
  network?: string;
  depositAddress?: string;
  depositAccount?: any;
  metadata?: any;

  // Off-ramp specific fields (combined from existing Transaction and TransactionDto)
  amount_offramp?: number; // Off-ramp amount in token (from TransactionDto)
  fiatAmount?: number; // Off-ramp fiat amount in NGN
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
}

export interface SwapTransaction {
  id: string;
  reference: string;
  fromTokenType: string;
  fromAmount: number;
  toTokenType: string;
  toAmount: number;
  exchangeRate: number;
  sourceAddress: string;
  destinationAddress: string;
  status: string;
  transactionHash?: string;
  fromNetwork?: string;
  toNetwork?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TransactionsResponse {
  onramp: Transaction[];
  offramp: Transaction[];
  swap: SwapTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ResolveAccountResponse {
  status?: string;
  message?: string;
  data?: {
    accountName?: string;
    accountNumber?: string;
    bankCode?: string;
  };
}

export const stablestackApi = {
  // currency (ISO 4217) selects the corridor's bank list — defaults to the
  // app-wide default processor's banks (NGN) when omitted.
  getBanks: (currency?: string) => {
    const params = new URLSearchParams();
    if (currency) params.append("currency", currency);
    const qs = params.toString();
    return api.get<{ status: string; message: string; data: Bank[] }>(
      `/stablestack/banks${qs ? `?${qs}` : ""}`,
    );
  },

  resolveAccount: (bankCode: string, accountNumber: string, currency?: string) => {
    const params = new URLSearchParams();
    params.append("bankCode", bankCode);
    params.append("accountNumber", accountNumber);
    if (currency) params.append("currency", currency);
    return api.get<ResolveAccountResponse>(`/stablestack/resolve-account?${params.toString()}`);
  },

  onRamp: (data: OnRampDto) =>
    api.post("/stablestack/onramp", data),

  offRamp: (data: OffRampDto) =>
    api.post("/stablestack/offramp", data),

  // Reports the Stellar tx hash of a direct CNGN deposit for a PENDING
  // offramp so the backend can verify it via Horizon (Flint can't see
  // Stellar deposits itself — see backend confirmOfframpDeposit).
  confirmOfframpDeposit: (reference: string, transactionHash: string) =>
    api.post(`/stablestack/offramp/${reference}/confirm-deposit`, { transactionHash }),

  getTransactions: (id?: string, reference?: string, page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (id) params.append("id", id);
    if (reference) params.append("reference", reference);
    if (page) params.append("page", page.toString());
    if (limit) params.append("limit", limit.toString());
    return api.get<TransactionsResponse>(`/stablestack/transactions?${params.toString()}`);
  },
};

// ============== Admin API ==============

export interface AdminUser extends User {
  _count?: {
    onrampTransactions: number;
    offrampTransactions: number;
  };
}

export interface UsersResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminTransactionsResponse {
  transactions: Transaction[]; // Unified transactions
}


export interface CreateMerchantDto {
  email: string;
  name: string;
  businessName: string;
  websiteUrl: string;
  trafficEstimate?: string;
  requestLimit?: string;
}

// Response from backend ApproveMerchant
export interface ApproveMerchantResponse {
  user: User;
  message: string;
}

export const adminApi = {
  getMe: () =>
    api.get<AdminUser>("/admin/me"),

  getUsers: (page: number = 1, limit: number = 10) =>
    api.get<UsersResponse>(`/admin/users?page=${page}&limit=${limit}`),

  getUserById: (id: string) =>
    api.get<AdminUser>(`/admin/users/${id}`),

  approveMerchantAccess: (data: CreateMerchantDto) =>
    api.post<ApproveMerchantResponse>("/admin/approve-access", data),

  // API Key Management
  getAllApiKeys: (page: number = 1, limit: number = 10) =>
    api.get<ApiKeysResponse>(`/admin/api-keys?page=${page}&limit=${limit}`),


  getUserApiKeys: (userId: string) =>
    api.get<ApiKey[]>(`/admin/users/${userId}/api-keys`),

  createApiKeyForUser: (userId: string, data: CreateApiKeyDto) =>
    api.post<CreateApiKeyResponse>(`/admin/users/${userId}/api-keys`, data),

  revokeApiKey: (id: string) =>
    api.delete<{ message: string }>(`/admin/api-keys/${id}`),

  // Admin API Keys Management
  getApiKeysSummary: () =>
    api.get<ApiKeysSummaryResponse>("/admin/api-keys/summary"),

  getApiKeysAnalytics: (period: "daily" | "weekly" | "monthly" = "daily") =>
    api.get<ApiKeyAnalyticsDataPoint[]>(
      `/admin/api-keys/analytics?period=${period}`,
    ),

  getTransactions: (page: number = 1, limit: number = 10, status?: string) =>
    api.get<TransactionsResponse>(`/admin/platform-transactions?page=${page}&limit=${limit}${status ? `&status=${status}` : ""}`),

  getTransactionsSummary: () =>
    api.get<TransactionsSummaryResponse>("/admin/transactions/summary"),

  getTransactionsAnalytics: (period: "daily" | "weekly" | "monthly" = "daily") =>
    api.get<TransactionAnalyticsDataPoint[]>(
      `/admin/transactions/analytics?period=${period}`,
    ),
};

export interface AdminTransactionSummaryResponse {
  onRamps: {
    count: number;
    totalAmount: number;
  };
  offRamps: {
    count: number;
    totalAmount: number;
  };
  swaps: {
    count: number;
    totalAmount: number;
  };
}

export interface AnalyticsDataPoint {
  date: string;
  onRampCount: number;
  offRampCount: number;
  swapCount: number;
  onRampVolume: number;
  offRampVolume: number;
  swapVolume: number;
}
// ============== Swap API ==============

export interface InitializeSwapDto {
  amount: number; // fiat amount for offramp
  fromAmount: number; // amount of fromTokenType being sold/swapped
  // Token being sold/swapped away — 'USDC', 'XLM', 'BRIDGE_USDC', or a
  // corridor stablecoin code. Defaults to 'USDC'. Must differ from the
  // destination corridor's own stablecoin (that case is a direct offramp,
  // not a swap).
  fromTokenType?: string;
  slippage: number;
  offrampDestination: {
    bankCode: string;
    accountNumber: string;
  };
  network?: string;
  // Fiat currency (ISO 4217) — selects the destination corridor. Defaults to 'NGN'.
  currency?: string;
}

// A fiat/stablecoin pair AutoRamp can currently serve — drives currency
// selectors instead of hardcoding NGN/CNGN. USDC is always tradable
// alongside these and isn't included in this list.
export interface Corridor {
  countryCode: string;
  fiatCurrency: string;
  stablecoinCode: string;
  // How to collect this corridor's fiat leg on Buy: the usual bank-transfer
  // deposit account, or 'mobile_money' (KES today) — a phone number that
  // gets an M-Pesa push prompt instead, no account to display.
  onrampCollectionMethod: "bank_transfer" | "mobile_money";
}

export interface StellarAsset {
  code: string;
  // Omitted for native XLM — treat a missing issuer as native, never as
  // `new Asset(code, undefined)` (a different, non-native asset entirely).
  issuer?: string;
}

export interface SwapResponse {
  swap: {
    id: string;
    reference: string;
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
    status: string;
    createdAt: string;
  };
  offramp: {
    id: string;
    reference: string;
    status: string;
  };
  recipientAddress: string;
  swapParams: {
    sendAsset: StellarAsset;
    sendAmount: string;
    destAsset: StellarAsset;
    destMin: string;
    destination: string;
    memo: string;
    slippage: number;
  };
}

export interface UpdateSwapDto {
  transactionHash: string;
  sourceAddress: string;
}

export interface SwapQuote {
  sourceAmount: string;
  destinationAmount: string;
  exchangeRate: number;
  sourceAsset: StellarAsset;
  destAsset: StellarAsset;
}

export interface CreateSimpleSwapDto {
  fromTokenType: string;
  toTokenType: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  sourceAddress: string;
  destinationAddress: string;
  network?: string;
  slippage?: number;
}

export interface CreateSimpleSwapResponse {
  id: string;
  reference: string;
  fromTokenType: string;
  fromAmount: number;
  toTokenType: string;
  toAmount: number;
  exchangeRate: number;
  sourceAddress: string;
  destinationAddress: string;
  status: string;
  network: string;
  createdAt: string;
}

export const swapApi = {
  getCorridors: () => api.get<Corridor[]>("/swap/corridors"),

  initializeSwap: (data: InitializeSwapDto) =>
    api.post<SwapResponse>("/swap/initialize", data),
  createSimpleSwap: (data: CreateSimpleSwapDto) =>
    api.post<CreateSimpleSwapResponse>("/swap/create", data),

  updateSwapAfterExecution: (reference: string, data: UpdateSwapDto) =>
    api.post(`/swap/${reference}/complete`, data),

  getTokenBalance: (token: string, address: string) =>
    api.get<string | null>(`/swap/balance/${token}/${address}`),

  getTokenBalances: (address: string) =>
    api.get<Record<string, string | null>>(`/swap/balances?address=${address}`),

  hasTrustline: (token: string, address: string) =>
    api.get<{ hasTrustline: boolean }>(`/swap/trustline/${token}/${address}`),

  // Returns a transaction (already partially signed by AutoRamp's
  // distribution account, which sponsors the reserve) for the user's
  // wallet to sign and submit — they pay only the negligible base fee.
  getSponsoredTrustline: (token: string, address: string) =>
    api.post<{ xdr: string; networkPassphrase: string }>(
      `/swap/trustline/${token}/${address}/sponsor`,
    ),

  getQuote: (fromToken: string, toToken: string, amount: number) =>
    api.get<SwapQuote>(
      `/swap/quote?fromToken=${fromToken}&toToken=${toToken}&amount=${amount}`,
    ),

  getUsdNgnRate: () => api.get<{ rate: number }>("/swap/usd-ngn-rate"),

  estimateNgn: (cngnAmount: number) =>
    api.get<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }>(
      `/swap/estimate-ngn?cngnAmount=${cngnAmount}`,
    ),
};

// ============== Bridge (CCTP cross-chain USDC) API ==============

// A chain the CCTP bridge can move USDC to/from — drives chain selectors
// instead of hardcoding Stellar/Base/Ethereum.
export interface BridgeChain {
  name: string;
  chainType: "EVM" | "STELLAR";
  cctpDomain: number;
  usdcAddress: string;
  isActive: boolean;
}

// A bridgeable-in stablecoin registered on a chain, beyond its own USDC —
// drives the Swap tab's "USDC from" source-token selector.
export interface BridgeChainToken {
  tokenCode: string;
  address: string;
  decimals: number;
  isActive: boolean;
  // This token's own natural fiat currency (ISO 4217) — 'EUR' for EURC,
  // 'BRL' for BRZ, etc. Drives Buy/Sell's auto-populated fiat side.
  fiatCurrency: string;
}

export interface CreateBridgeTransferDto {
  sourceChain: string;
  destinationChain?: string;
  // Optional only with payoutFiat set (nothing is ever delivered there —
  // the mint is redirected to AutoRamp's own distribution account
  // regardless — so the backend defaults it when omitted); required
  // otherwise.
  destinationAddress?: string;
  // In sourceTokenCode's units (USDC unless sourceTokenCode says otherwise).
  expectedAmount?: number;
  // Multi-stablecoin bridge-in: the token expectedAmount is denominated
  // in, on an EVM sourceChain — 'USDT', 'DAI', etc. Defaults to 'USDC'
  // (skip the pre-burn swap).
  sourceTokenCode?: string;
  // Swap tab only: converts the bridged USDC into this corridor
  // stablecoin instead of leaving it as raw USDC (destinationChain stellar).
  payoutStablecoinCode?: string;
  // Swap tab only: when destinationChain is an EVM chain, converts the
  // bridged USDC into this ChainToken via a self-custodial follow-up swap
  // once the transfer COMPLETEs — see bridgeApi.buildDestinationSwap.
  // Mutually exclusive with payoutStablecoinCode.
  payoutTokenCode?: string;
  // Swap tab only: slippage tolerance (0-1) for the payout leg's quote —
  // below this floor at completion time, the payout is held for manual
  // review instead of paid out short. Defaults to 0.05 server-side.
  payoutSlippage?: number;
  // Sell tab: when true, the bridged USDC is paid out as fiat instead of a
  // stablecoin — mutually exclusive with payoutStablecoinCode.
  payoutFiat?: boolean;
  payoutBankCode?: string;
  payoutAccountNumber?: string;
  payoutFiatCurrency?: string;
  // Required for both source chain types — the connected wallet's address.
  sourceAddress?: string;
}

export interface EvmUnsignedTransaction {
  to: string;
  data: string;
  value: string;
}

export interface CreateBridgeTransferResponse {
  reference: string;
  sourceChain: string;
  destinationChain: string;
  // Stellar source: only the approve XDR — the burn XDR can't be built yet
  // (its Soroban resource footprint depends on the allowance the approve
  // tx grants, which only exists once that's confirmed on-chain). Sign +
  // submit this first, then call bridgeApi.buildBurnTransaction for the
  // burn XDR.
  approveTransactionXdr?: string;
  networkPassphrase?: string;
  // EVM source: two unsigned transactions for the connected wallet to
  // submit in sequence (approve, then depositForBurnWithHook) — building
  // both up front is fine here since EVM calldata encoding doesn't require
  // simulating against live state the way Soroban does.
  approveTransaction?: EvmUnsignedTransaction;
  burnTransaction?: EvmUnsignedTransaction;
  // Multi-stablecoin bridge-in: present only when sourceTokenCode was a
  // non-USDC token — sign+submit these two BEFORE approveTransaction/
  // burnTransaction, in order: approve the source token, then swap it to
  // USDC via 0x.
  sourceSwapApproveTransaction?: EvmUnsignedTransaction;
  sourceSwapTransaction?: EvmUnsignedTransaction;
  estimatedSourceSwapUsdc?: string;
  // Swap tab only: the payout quote captured at intent-creation time.
  estimatedPayoutAmount?: string;
  exchangeRate?: number;
}

export interface BuildBurnTransactionResponse {
  burnTransactionXdr: string;
  networkPassphrase: string;
}

export interface BridgeTransferStatus {
  id: string;
  reference: string;
  sourceChain: string;
  destinationChain: string;
  destinationAddress: string;
  expectedAmount?: string;
  collectionAddress?: string;
  sourceTokenCode?: string;
  sourceSwapQuote?: string;
  sourceSwapMinUsdc?: string;
  payoutStablecoinCode?: string;
  payoutTokenCode?: string;
  payoutSlippage?: string;
  quotedPayoutAmount?: string;
  minPayoutAmount?: string;
  payoutAmount?: string;
  status: "PENDING_BURN" | "BURNING" | "BURNED" | "ATTESTED" | "COMPLETED" | "PAYOUT_HELD" | "FAILED";
  burnTxHash?: string;
  mintTxHash?: string;
  payoutTxHash?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface BuildEvmSwapDto {
  chainName: string;
  sellTokenCode: string;
  buyTokenCode: string;
  sellAmount: number;
  takerAddress: string;
}

export interface BuildEvmSwapResponse {
  approveTransaction: EvmUnsignedTransaction;
  swapTransaction: EvmUnsignedTransaction;
  estimatedOutput: string;
  minOutput: string;
}

export const bridgeApi = {
  getChains: () => api.get<BridgeChain[]>("/bridge/chains"),

  getChainTokens: (chain: string) => api.get<BridgeChainToken[]>(`/bridge/chain-tokens/${chain}`),

  createTransfer: (data: CreateBridgeTransferDto) =>
    api.post<CreateBridgeTransferResponse>("/bridge/transfers", data),

  buildEvmSwap: (data: BuildEvmSwapDto) =>
    api.post<BuildEvmSwapResponse>("/bridge/evm-swap", data),

  buildDestinationSwap: (reference: string) =>
    api.post<BuildEvmSwapResponse>(`/bridge/transfers/${reference}/build-destination-swap`),

  buildBurnTransaction: (reference: string, sourceAddress: string) =>
    api.post<BuildBurnTransactionResponse>(`/bridge/transfers/${reference}/burn-transaction`, { sourceAddress }),

  registerBurn: (reference: string, burnTxHash: string) =>
    api.post(`/bridge/transfers/${reference}/register-burn`, { burnTxHash }),

  getStatus: (reference: string) =>
    api.get<BridgeTransferStatus>(`/bridge/transfers/${reference}`),

  getBalance: (chain: string, address: string) =>
    api.get<{ chain: string; address: string; balance: string }>(
      `/bridge/balance/${chain}/${encodeURIComponent(address)}`,
    ),
};
