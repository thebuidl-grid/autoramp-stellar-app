import type { AttentionCounts, HealthPage, TraceResult, WebhookDetail, WebhookPage } from "@/lib/tracker";
import axios, { AxiosError } from "axios";
import type { OfframpView, ReconciliationRecord } from "@/lib/offramp-status";
import { useAuthStore } from "./store";
import { getActiveNetwork } from "./network";

/**
 * API Configuration
 *
 * Base API client for communicating with the backend.
 */

// In the browser every call goes to the same-origin proxy (app/api/backend), so
// the real backend URL never ships in client JS. During SSR there is no origin
// to be relative to, so use the server-only URL directly.
const API_BASE_URL =
  typeof window === "undefined"
    ? process.env.API_URL?.replace(/\/+$/, "")
    : "/api/backend";

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
    // Get token from global store (synced with localStorage)
    const storeToken = useAuthStore.getState().token;

    // Fallback to direct localStorage if store is not yet initialized
    const token =
      storeToken ||
      (typeof window !== "undefined" ? localStorage.getItem("token") : null);

    if (token) {
      if (config.headers) {
        // Use the standard set method for AxiosHeaders in Axios 1.x
        if (typeof config.headers.set === "function") {
          config.headers.set("Authorization", `Bearer ${token}`);
        } else {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } else {
      // Debug log for missing token scenarios (only in dev)
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[API] No token found in store or localStorage for: ${config.url}`,
        );
      }
    }
    // Tell the backend which network the toggle is on, so each transaction records whether it was a test or real.
    config.headers?.set?.("X-Chain-Network", getActiveNetwork());
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Rely on AuthProvider and store for global logout handling
    // Direct localStorage manipulation here causes synchronization issues
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

// ============== User API ==============

export interface User {
  id: string;
  email: string;
  phoneNumber?: string;
  walletAddress?: string;
  role: string;
  isMerchant?: boolean;
  isApiAccessApproved?: boolean;
  isOTCEnabled?: boolean;
  suspended?: boolean;
  suspendedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export const authApi = {
  signUp: (data: SignUpDto) => api.post<AuthResponse>("/auth/signup", data),

  signIn: (data: SignInDto) => api.post<AuthResponse>("/auth/signin", data),

  adminLogin: (data: SignInDto) =>
    api.post<AuthResponse>("/auth/admin/login", data),

  sendOtp: (data: SendOtpDto) =>
    api.post<{ success: boolean; message: string }>("/auth/otp/send", data),

  verifyOtp: (data: VerifyOtpDto) =>
    api.post<{ success: boolean; message: string }>("/auth/otp/verify", data),
};

// ============== Saved Accounts & Wallets Types ==============

export interface SavedAccountNumber {
  id: string;
  userId: string;
  accountNumber: string;
  accountName?: string;
  bankCode: string;
  bankName: string;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
}

export interface CreateSavedAccountDto {
  accountNumber: string;
  bankCode: string;
  bankName: string;
}

export interface UpdateSavedAccountDto {
  bankName?: string;
}

export interface UserWallet {
  id: string;
  userId: string;
  address: string;
  network: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserWalletDto {
  address: string;
  network: string;
  name?: string;
}

export interface UpdateUserWalletDto {
  name?: string;
}

// OTP verification for adding saved accounts
export interface InitiateAddAccountDto {
  email: string;
}

export interface InitiateAddAccountResponse {
  success: boolean;
  message: string;
}

export interface VerifyAndAddAccountDto {
  code: string;
  email: string;
  bankAccount: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
    metadata?: any;
  };
}

export const userApi = {
  getProfile: () => api.get<User>("/user/profile"),

  // User API Keys
  getMerchantApiKeys: () => api.get<ApiKey[]>("/user/api-keys"),

  createApiKey: (data: CreateApiKeyDto) =>
    api.post<CreateApiKeyResponse>("/merchants/api-keys", data),

  getUserApiKeyStats: () =>
    api.get<UserApiKeyStatsResponse>("/user/api-keys/stats"),

  getUserApiKeyAnalytics: (period: "daily" | "weekly" | "monthly" = "daily") =>
    api.get<UserApiKeyAnalyticsDataPoint[]>(
      `/user/api-keys/analytics?period=${period}`,
    ),

  // Saved Bank Accounts with OTP verification
  initiateAddAccount: (data: InitiateAddAccountDto) =>
    api.post<InitiateAddAccountResponse>(
      "/user/bank-accounts/initiate-verification",
      data,
    ),

  verifyAndAddAccount: (data: VerifyAndAddAccountDto) =>
    api.post<SavedAccountNumber>(
      "/user/bank-accounts/complete-verification",
      data,
    ),

  getSavedAccounts: () => api.get<SavedAccountNumber[]>("/user/bank-accounts"),

  getSavedAccountById: (id: string) =>
    api.get<SavedAccountNumber>(`/user/bank-accounts/${id}`),

  updateSavedAccount: (id: string, data: UpdateSavedAccountDto) =>
    api.patch<SavedAccountNumber>(`/user/bank-accounts/${id}`, data),

  deleteSavedAccount: (id: string) => api.delete(`/user/bank-accounts/${id}`),

  // User Wallets
  createUserWallet: (data: CreateUserWalletDto) =>
    api.post<UserWallet>("/user/wallets", data),

  getUserWallets: () => api.get<UserWallet[]>("/user/wallets"),

  getUserWalletById: (id: string) => api.get<UserWallet>(`/user/wallets/${id}`),

  updateUserWallet: (id: string, data: UpdateUserWalletDto) =>
    api.patch<UserWallet>(`/user/wallets/${id}`, data),

  deleteUserWallet: (id: string) => api.delete(`/user/wallets/${id}`),
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
  period?: string;
  totalVolume?: number;
  totalCount?: number;
  successRate?: number;
  onramp?: { count: number; volume?: number; totalAmount?: number; totalFees?: number };
  offramp?: { count: number; volume?: number; totalAmount?: number; totalFees?: number };
  swap?: { count: number; volume?: number; totalFromAmount?: number; totalToAmount?: number; totalFees?: number };
  bankTransfer?: { count: number; volume?: number; totalAmount?: number; totalFees?: number };
  vas?: { count: number; volume?: number; totalAmount?: number; totalFees?: number };
  otc?: { count: number; volume?: number; totalAmount?: number; totalFees?: number };
  fees?: {
    provider_fee: number;
    vat: number;
    stamp_duty: number;
    platform_fee: number;
    total: number;
  };
  netVolume?: number;
}

export interface UnifiedTransaction {
  id: string;
  type: "onramp" | "offramp" | "swap" | "bank_transfer";
  amount: number;
  status: string;
  createdAt: string;
  reference: string;
  details: Record<string, any>;
  /** Fees we charged on this transaction. Older backends do not send it. */
  fees?: Array<{ type: string; amount: string; currency: string }>;
}

export interface UnifiedTransactionsResponse {
  data: UnifiedTransaction[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface TransactionAnalyticsDataPoint {
  date: string;
  onrampVolume: number;
  onrampCount: number;
  offrampVolume: number;
  offrampCount: number;
  swapVolume: number;
  swapCount: number;
  bankTransferVolume: number;
  bankTransferCount: number;
  vasVolume: number;
  vasCount: number;
  otcVolume: number;
  otcCount: number;
  totalVolume: number;
  totalCount: number;
  totalFees: number;
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
  bankCode?: string;
  name?: string;
  code?: string;
}

export interface OnRampDto {
  network: string;
  type?: string;
  amount: number;
  /** ISO alpha-2 fiat country (stellar network only): NG (default), GH, KE. */
  country?: string;
  destination: {
    address: string;
  };
}

export interface OffRampDto {
  network: string;
  type?: string;
  amount: number;
  /** ISO alpha-2 fiat country (stellar network only): NG (default), GH, KE. */
  country?: string;
  /** The app's network toggle. The backend builds Stellar CCTP off-ramps for this network (default: mainnet). */
  chainNetwork?: "mainnet" | "testnet";
  destination: {
    bankCode: string;
    accountNumber: string;
  };
  sourceAddress?: string;
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
  depositAccount?: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
  };
  metadata?: any;

  // Off-ramp specific fields (combined from existing Transaction and TransactionDto)
  amount_offramp?: number; // Off-ramp amount in token (from TransactionDto)
  fiatAmount?: number; // Off-ramp fiat amount in NGN
  tokenType?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  bankCode?: string;
  // Off-ramp reconciliation (Bitnob provider order)
  providerOrder?: {
    depositTxHash?: string | null;
    failureReason?: string | null;
    receivedAmount?: string | null;
    expectedAmount?: string | null;
    fundingAddress?: string | null;
    expiresAt?: string | null;
  };
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

export interface PlatformTransaction {
  id: string;
  reference: string;
  amount: number;
  currency?: string | null;
  status: string;
  createdAt: string;
  type: "onramp" | "offramp" | "swap" | "otc" | "merchant_onramp" | "merchant_offramp" | "merchant_swap" | "bank_transfer" | "vas";
  user: string | null;
  merchant: string | null;
}

export interface AdminPlatformTransactionsResponse {
  data: PlatformTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AdminPlatformTransactionsCursorResponse {
  data: PlatformTransaction[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AdminOtcTransaction {
  id: string;
  reference: string;
  amount: number;
  fiatAmountReceived: number;
  status: string;
  createdAt: string;
  user: { email: string; contactName: string | null; businessName: string | null };
  userEmail: string;
  userName: string;
  network?: string;
  fromAmount?: number;
  fromCurrency?: string;
  toAmount?: number;
  toCurrency?: string;
  exchangeRate?: number;
  meta?: { safehavenData?: Record<string, unknown>; [key: string]: unknown };
}

export interface AdminOtcTransactionsResponse {
  transactions: AdminOtcTransaction[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type MerchantTransactionsResponse = PaginatedResponse<Transaction>;

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
  getBanks: (country?: string) =>
    api.get<{ status: string; message: string; data: Bank[] }>(
      `/misc/banks${country && country !== "NG" ? `?country=${encodeURIComponent(country)}` : ""}`,
    ),

  resolveAccount: (bankCode: string, accountNumber: string, country?: string) => {
    const params = new URLSearchParams();
    params.append("bankCode", bankCode);
    params.append("accountNumber", accountNumber);
    if (country && country !== "NG") params.append("country", country);
    return api.get<ResolveAccountResponse>(
      `/misc/resolve-account?${params.toString()}`,
    );
  },

  onRamp: (data: OnRampDto) => api.post("/ramp/onramp", data),

  offRamp: (data: OffRampDto) => api.post("/ramp/offramp", data),

  /** Stellar off-ramp over CCTP: ask the backend to mint the burned USDC on Base. Idempotent; poll until "minted". */
  relayOfframp: (reference: string) =>
    api.post<{
      reference: string;
      state: "awaiting_burn" | "attesting" | "minting" | "minted";
      mintTxHash?: string;
      message?: string;
    }>(`/ramp/offramp/${encodeURIComponent(reference)}/relay`),

  confirmOfframp: (reference: string, stellarTxHash: string) =>
    api.post(`/ramp/offramp/${reference}/confirm`, { stellarTxHash }),

  getTransactions: (
    id?: string,
    reference?: string,
    page?: number,
    limit?: number,
  ) => {
    const params = new URLSearchParams();
    if (id) params.append("id", id);
    if (reference) params.append("reference", reference);
    if (page) params.append("page", page.toString());
    if (limit) params.append("limit", limit.toString());
    return api.get<TransactionsResponse>(
      `/ramp/transactions?${params.toString()}`,
    );
  },

  /**
   * Off-ramp detail. `view` is the backend's full status view (state machine, history, settlement,
   * reconciliation); older backends return only { transaction, history }.
   */
  getOfframpDetail: (reference: string) =>
    api.get<{ transaction: any; history: any[]; view?: OfframpView | null }>(
      `/ramp/offramp/${encodeURIComponent(reference)}`,
    ),

  /** Structured reconciliation record for one of the caller's cash-outs. */
  getOfframpReconciliation: (reference: string) =>
    api.get<ReconciliationRecord>(
      `/ramp/offramp/${encodeURIComponent(reference)}/reconciliation`,
    ),
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
  userId: string;
  name: string;
  natureOfBusiness?: string;
  description?: string;
  websiteUrl: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  metadata?: any;
}

// Response from backend ApproveMerchant
export interface ApproveMerchantResponse {
  user: User;
  message: string;
}

export interface Director {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  bvn?: string;
  idType?: string;
  idUrl?: string;
  proofOfAddress?: string;
  metadata?: {
    role?: string;
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface Shareholder {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  bvn?: string;
  idType?: string;
  idUrl?: string;
  proofOfAddress?: string;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface MerchantBankAccount {
  id: string;
  merchantId: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  autoSweep?: boolean;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantDocumentation {
  id: string;
  merchantId: string;
  cacCertificate?: string | null;
  cacEStatus?: string | null;
  memart?: string | null;
  memorandum?: string | null;
  proofOfAddress?: string | null;
  capitalSource?: string | null;
  tradingName?: string | null;
  taxIdentificationNumber?: string | null;
  tin?: string | null;
  proofOfFunds?: string | null;
  directorProofOfAddress?: string | null;
  idDocument?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactPerson {
  contactName: string;
  email: string;
  phoneNumber: string;
}

export interface MerchantUser {
  id: string;
  userId: string;
  name: string;
  natureOfBusiness: string;
  description: string;
  websiteUrl: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  status: "PENDING" | "REJECTED" | "VERIFIED";
  verifiedAt: string | null;
  rejectionReason: string | null;
  metadata: {
    industry?: string;
    contactPerson?: string;
    [key: string]: any;
  } | null;
  createdAt: string;
  updatedAt: string;
  user: {
    email: string;
    contactName: string | null;
  };
  isApiAccessApproved?: boolean;
  documentations?: MerchantDocumentation[];
  directors?: Director[];
  shareholders?: Shareholder[];
  bankAccounts?: MerchantBankAccount[];
  contactPerson?: ContactPerson;
}

export interface MerchantsResponse {
  merchants: MerchantUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TransferLog {
  id: string;
  transactionId: string;
  type: "ONRAMP" | "OFFRAMP";
  safehavenPayload: Record<string, unknown>;
  stablestackPayload: {
    request: Record<string, unknown>;
    response: Record<string, unknown>;
  };
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  updatedAt: string;
}

export interface TransferLogsResponse {
  logs: TransferLog[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TransferLogDetailResponse {
  logs: TransferLog[];
  transaction: {
    id: string;
    reference: string;
    amount: string;
    status: string;
    createdAt: string;
    _type: "onramp" | "offramp";
  };
  user: {
    id: string;
    email: string;
    phoneNumber: string;
  };
}

export interface AuditLog {
  id: string;
  merchantId: string;
  action: string;
  provider: string;
  endpoint: string;
  method: string;
  request: Record<string, any>;
  response: Record<string, any>;
  statusCode: number;
  duration: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  data: AuditLog[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface WaitlistEntry {
  id: string;
  email: string;
  /** null for signups made before these fields were required */
  name: string | null;
  phoneNumber: string | null;
  userType: string | null;
  /** country picked in the phone selector (ISO) */
  phoneCountry: string | null;
  /** country the signup request came from (ISO, from the edge; unverified) */
  country: string | null;
  /** referring site hostname; null = direct / unknown */
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  source: string | null;
  createdAt: string;
}

export interface WaitlistListResponse {
  data: WaitlistEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface WaitlistStatsResponse {
  total: number;
  today: number;
  inRange: number;
  averagePerDay: number;
  days: number;
  change: { previous: number; percent: number | null };
  series: { date: string; count: number; cumulative: number }[];
  /** 7 (Sun..Sat) x 24 (UTC hour) signup counts */
  heatmap: number[][];
  bySource: { source: string; count: number }[];
  /** all-time; always the four types plus `unknown` for older signups */
  byType: { type: string; count: number; percent: number }[];
  /** all-time, top 15; key is an ISO code or "unknown" */
  byCountry: { key: string; count: number; percent: number }[];
  /** all-time, top 15; key is a hostname or "direct" */
  byReferrer: { key: string; count: number; percent: number }[];
  conversion: { registered: number; total: number; rate: number };
}

export interface UserAnalyticsResponse {
  days: number;
  users: {
    total: number;
    new: number;
    newChange: { previous: number; percent: number | null };
    signups: { date: string; count: number; cumulative: number }[];
  };
  active: {
    dau: number;
    wau: number;
    mau: number;
    stickiness: number;
    transactingPerDay: { date: string; users: number }[];
  };
  funnel: { step: string; count: number; percent: number }[];
  transactions: {
    kind: "onramp" | "offramp" | "swap";
    total: number;
    completed: number;
    failed: number;
    successRate: number;
    users: number;
  }[];
  volume: { kind: "onramp" | "offramp"; currency: string; amount: number }[];
  retention: { day: number; eligible: number; retained: number; percent: number }[];
}

/** Public: join the waitlist. */
export const waitlistApi = {
  join: (input: {
    name: string;
    email: string;
    phoneNumber: string;
    userType: string;
    phoneCountry?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    source?: string;
  }) => api.post<{ status: string; message: string }>("/waitlist", input),
};

export const adminApi = {
  getMe: () => api.get<AdminUser>("/admin/me"),

  getUsers: (
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
    role?: string,
  ) =>
    api.get<UsersResponse>(
      `/admin/users?page=${page}&limit=${limit}${search ? `&search=${search}` : ""}${status ? `&status=${status}` : ""}${role ? `&role=${role}` : ""}`,
    ),

  getUserAnalytics: (days: number = 30) =>
    api.get<UserAnalyticsResponse>("/admin/user-analytics", { params: { days } }),

  getWaitlist: (page: number = 1, limit: number = 20, search?: string) =>
    api.get<WaitlistListResponse>("/admin/waitlist", {
      params: { page, limit, ...(search ? { search } : {}) },
    }),

  getWaitlistStats: (days: number = 30) =>
    api.get<WaitlistStatsResponse>("/admin/waitlist/stats", { params: { days } }),

  exportWaitlistCsv: () =>
    api.get<Blob>("/admin/waitlist/export", { responseType: "blob" }),

  getUserById: (id: string) => api.get<AdminUser>(`/admin/users/${id}`),

  createUser: (data: {
    email: string;
    phone_number?: string;
    wallet_address?: string;
    is_merchant?: boolean;
    is_api_access_approved?: boolean;
    contact_name?: string;
  }) => api.post<AdminUser>(`/admin/users`, data),

  updateUserProfile: (
    userId: string,
    data: Partial<{
      email: string;
      phone_number?: string;
      wallet_address?: string;
      contact_name?: string;
    }>,
  ) => api.patch<AdminUser>(`/admin/users/${userId}/profile`, data),

  suspendUser: (userId: string, data: { suspend: boolean }) =>
    api.patch<{ message: string }>(`/admin/users/${userId}/suspend`, data),

  updateUserFlags: (
    userId: string,
    data: {
      isMerchant?: boolean;
      isApiAccessApproved?: boolean;
      isOTCEnabled?: boolean;
    },
  ) => api.patch<AdminUser>(`/admin/users/${userId}/flags`, data),

  // A merchant's API keys, as an admin sees them. Create and revoke go through /merchants/api-keys (see lib/merchant.ts).
  getMerchantApiKeys: (merchantId: string) =>
    api.get<ApiKey[]>(`/merchants/api-keys/?merchantId=${merchantId}`),

  getTransactions: (
    page: number,
    limit: number,
    status?: string,
    type?: string,
    search?: string,
    currency?: string,
  ) => {
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    if (type) params.append("type", type);
    if (currency) params.append("currency", currency);
    return api.get<AdminPlatformTransactionsResponse>(
      `/admin/platform-transactions?${params.toString()}`,
    );
  },

  getTransactionsSummary: (period?: "today" | "7d" | "30d" | "90d" | "all") => {
    const qs = period ? `?period=${period}` : "";
    return api.get<TransactionsSummaryResponse>(`/admin/transactions/summary${qs}`);
  },

  // Transaction tracker and payout reconciliation
  getTrace: (reference: string) => api.get<TraceResult>(`/admin/transactions/${encodeURIComponent(reference)}/trace`),
  reconcileOfframp: (reference: string) => api.post<{ reference: string; kind: "offramp"; status: string; progressed: boolean; message: string }>(`/admin/transactions/${encodeURIComponent(reference)}/reconcile`),

  getStuckTransactions: (params: { type?: string; provider?: string; includeAbandoned?: boolean; limit?: number; offset?: number } = {}) =>
    api.get<HealthPage>("/admin/transactions/stuck", { params }),

  getFailedTransactions: (params: { type?: string; provider?: string; limit?: number; offset?: number } = {}) =>
    api.get<HealthPage>("/admin/transactions/failed", { params }),

  getAttentionCounts: () => api.get<AttentionCounts>("/admin/transactions/attention"),

  getWebhooks: (params: { provider?: string; matched?: boolean; processed?: boolean; limit?: number; offset?: number } = {}) =>
    api.get<WebhookPage>("/admin/webhooks", { params }),

  getWebhook: (id: string) => api.get<WebhookDetail>(`/admin/webhooks/${id}`),

  // Safehaven and CCTP (read-only)
  getSafehavenAccounts: (params: { kind?: string; q?: string; limit?: number; offset?: number } = {}) =>
    api.get<import("@/lib/safehaven").AdminPage<import("@/lib/safehaven").SafehavenAccount>>("/admin/safehaven/accounts", { params }),

  getSafehavenAccount: (accountNumber: string) =>
    api.get<{ account: import("@/lib/safehaven").SafehavenAccount; events: import("@/lib/safehaven").SafehavenEvent[] }>(`/admin/safehaven/accounts/${encodeURIComponent(accountNumber)}`),

  getSafehavenTransactions: (params: { status?: string; matched?: boolean; q?: string; limit?: number; offset?: number } = {}) =>
    api.get<import("@/lib/safehaven").AdminPage<import("@/lib/safehaven").SafehavenTransaction>>("/admin/safehaven/transactions", { params }),

  getCctpTransfers: (params: { status?: string; q?: string; limit?: number; offset?: number } = {}) =>
    api.get<import("@/lib/safehaven").AdminPage<import("@/lib/safehaven").CctpTransfer>>("/admin/cctp/transactions", { params }),

  getTransactionsAnalytics: (
    period: "daily" | "weekly" | "monthly" = "daily",
  ) =>
    api.get<TransactionAnalyticsDataPoint[]>(
      `/admin/transactions/analytics?period=${period}`,
    ),

  // Merchant Management
  getMerchants: () => api.get<MerchantUser[]>("/merchants/onboarding"),

  getMerchantById: (id: string) =>
    api.get<MerchantUser>(`/merchants/onboarding/${id}`),

  updateMerchant: (id: string, data: any) =>
    api.patch<MerchantUser>(`/merchants/onboarding/${id}`, data),

  updateMerchantStatus: (
    id: string,
    data: { status: string; rejectionReason?: string },
  ) =>
    api.post<{ message: string; merchant?: MerchantUser }>(
      `admin/merchants/${id}/status`,
      data,
    ),

  deleteMerchant: (id: string) => api.delete(`/merchants/onboarding/${id}`),

  approveMerchantAccess: (data: CreateMerchantDto) =>
    api.post<ApproveMerchantResponse>("/admin/approve-access", data),

  // Merchant Sub-resource Management
  getMerchantDocumentation: (merchantId: string) =>
    api.get<any>(`/merchants/documentations/${merchantId}`),

  getMerchantDirectors: (merchantId: string) =>
    api.get<Director[]>(`/merchants/directors/${merchantId}`),

  getMerchantShareholders: (merchantId: string) =>
    api.get<Shareholder[]>(`/merchants/shareholders/${merchantId}`),

  getMerchantBankAccounts: (merchantId: string) =>
    api.get<MerchantBankAccount[]>(`/merchants/bank-accounts/${merchantId}`),

  getMerchantBankAccountAdmin: (merchantId: string) =>
    api.get<{
      merchantId: string;
      fiatProvider: string;
      bankAccount: MerchantBankAccount | null;
      subAccounts: MerchantBankAccount[];
    }>(`/admin/merchants/${merchantId}/bank-account`),

  provisionMerchantBankAccount: (
    merchantId: string,
    data: { accountType: "Savings" | "Current"; suffix: string; provider: "PULSE_MFB" | "SAFEHAVEN" },
  ) =>
    api.post<{ message: string; accountNumber?: string }>(
      `/admin/merchants/${merchantId}/bank-account`,
      data,
    ),

  getAdminSubAccounts: (merchantId: string) =>
    api.get<any[]>(`/admin/merchants/${merchantId}/sub-accounts`),

  getAdminSubAccountTransactions: (
    merchantId: string,
    subAccountId: string,
    params?: {
      page?: number;
      limit?: number;
      status?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.status) query.append("status", params.status);
    if (params?.fromDate) query.append("fromDate", params.fromDate);
    if (params?.toDate) query.append("toDate", params.toDate);
    const queryString = query.toString();
    return api.get<any>(
      `/admin/merchants/${merchantId}/sub-accounts/${subAccountId}/transactions${queryString ? `?${queryString}` : ""}`,
    );
  },

  // OTC User Management
  getOtcUsers: (page: number = 1, limit: number = 10) =>
    api.get<UsersResponse>(
      `/admin/users?page=${page}&limit=${limit}&isOTCEnabled=true`,
    ),

  // OTC Transactions Management
  getOtcTransactions: (
    limit: number = 10,
    status?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
    cursor?: string,
  ) => {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    if (status) params.append("status", status);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (search) params.append("search", search);
    if (cursor) params.append("cursor", cursor);
    return api.get<AdminOtcTransactionsResponse>(`/admin/otc/transactions?${params.toString()}`);
  },

  getOtcSwapPrice: (
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    takerAddress?: string,
    chainId?: number,
  ) => {
    const params = new URLSearchParams();
    params.append("sellToken", sellToken);
    params.append("buyToken", buyToken);
    params.append("sellAmount", sellAmount);
    if (takerAddress) params.append("takerAddress", takerAddress);
    if (chainId) params.append("chainId", chainId.toString());
    return api.get<any>(`/admin/otc/swap-price?${params.toString()}`);
  },

  getOtcSwapQuote: (
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    takerAddress: string,
    chainId?: number,
  ) => {
    const params = new URLSearchParams();
    params.append("sellToken", sellToken);
    params.append("buyToken", buyToken);
    params.append("sellAmount", sellAmount);
    params.append("takerAddress", takerAddress);
    if (chainId) params.append("chainId", chainId.toString());
    return api.get<any>(`/admin/otc/swap-quote?${params.toString()}`);
  },

  // Transfer Logs
  getTransferLogs: (
    limit: number = 10,
    transactionId?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    cursor?: string,
  ) => {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    if (transactionId) params.append("transactionId", transactionId);
    if (status) params.append("status", status);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (cursor) params.append("cursor", cursor);
    return api.get<TransferLogsResponse>(`/admin/transfer-logs?${params.toString()}`);
  },

  getTransferLogByTransactionId: (transactionId: string) =>
    api.get<TransferLogDetailResponse>(`/admin/transfer-logs/${transactionId}`),

  getAuditLogs: (params?: { merchantId?: string; action?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.merchantId) query.append("merchantId", params.merchantId);
    if (params?.action) query.append("action", params.action);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    const qs = query.toString();
    return api.get<AuditLogsResponse>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
  },
};
// Redundant public merchant definitions moved to merchant.ts

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

// ============== OTC API Types ==============

export enum OtcIdentityType {
  BVN = "BVN",
  NIN = "NIN",
}

export interface OnboardOtcDto {
  identityType: OtcIdentityType;
  identityNumber: string;
}

export interface InitiateOtcTransactionDto {
  quantity: number;
  token: string;
  network: "base" | "bsc";
  chain?: string;
  address: string;
  memo?: string;
}

export interface InitiateOtcOfframpDto {
  quantity: number;
  token: string;
  network: "base" | "bsc";
  chain?: string;
  address: string;
  memo?: string;
  bankCode: string;
  accountNumber: string;
}

export interface OtcOnrampQuoteDto {
  amount: number;
  network?: "base" | "bsc";
}

export interface OtcOfframpQuoteDto {
  amount: number;
  network?: "base" | "bsc";
}

export interface OtcOnrampExecuteDto {
  amount: number;
  reference: string;
  network?: "base" | "bsc";
  notifyUrl?: string;
  destination: {
    address: string;
  };
}

export interface OtcOfframpExecuteDto {
  amount: number;
  reference: string;
  network?: "base" | "bsc";
  notifyUrl?: string;
  destination: {
    bankCode: string;
    accountNumber: string;
  };
}

export interface OtcTransaction extends Transaction {
  quantity: number;
  token: string;
  network: string;
  chain?: string;
  address: string;
  memo?: string;

  fiatAmountReceived?: number;
  systemFee?: number;
  networkFee?: number;
  feeCollected?: number;
  tokenAmountSent?: number;
  rate?: number;
  flatFee?: number;
  meta?: {
    type?: "onramp" | "offramp";
    quote?: {
      rate: number;
      totalAmount: number;
      ngnAmount?: number;
      flatFee?: number;
    };
    destination?: {
      bankCode?: string;
      accountNumber?: string;
      address?: string;
    };
  };
  issuance?: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
  };
  offrampDepositAddress?: {
    address: string;
    network: string;
    token: string;
    memo?: string | null;
  };
  note?: string[];
}

export interface OtcOnrampInitiateResponse {
  type: "onramp";
  reference: string;
  quote: {
    rate: number;
    flatFee: number;
    sourceAmount: number;
    destinationAmount: number;
  };
  issuance: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
  };
  destination: {
    address: string;
  };
}

export interface OtcOfframpInitiateResponse {
  type: "offramp";
  reference: string;
  quote: {
    rate: number;
    flatFee: number;
    sourceAmount: number;
    destinationAmount: number;
  };
  address: string;
  depositAddress: {
    address: string;
    network: string;
    token: string;
    memo?: string | null;
    expiresAt?: string | null;
  };
  destination: {
    bankCode: string;
    accountNumber: string;
  };
}

export type OtcInitiateResponse = OtcOnrampInitiateResponse | OtcOfframpInitiateResponse;

export interface OtcStatusResponse {
  id: string;
  reference: string;
  userId: string;
  otcUserId: string;
  amount: number;
  fiatAmountReceived: number;
  systemFee: number;
  rate: number;
  networkFee: number;
  feeCollected: number;
  quantity: number;
  tokenAmountSent: number;
  network: string;
  chain: string;
  token: string;
  address: string;
  status: string;
  issuance?: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
  } | null;
  deposit?: {
    address: string;
    token: string;
    network?: string;
    memo?: string | null;
    expiresAt?: string | null;
  } | null;
  expiresAt?: string | null;
  providerResponse?: {
    data: {
      deposit?: {
        note?: string[];
        asset?: string;
        amount?: number;
        address?: string;
        bank_code?: string;
        bank_account_number?: string;
        bank_account_name?: string;
        bank_name?: string;
      };
    };
    status: string;
    message: string;
  };
}

// ============== API Groups ==============

export const otcApi = {
  onboard: (data: OnboardOtcDto) =>
    api.post<{ success: boolean; message: string }>("/otc/onboard", data),

  initiate: (data: InitiateOtcTransactionDto) =>
    api.post<OtcOnrampInitiateResponse>("/otc/transaction", data),

  initiateOfframp: (data: InitiateOtcOfframpDto) =>
    api.post<OtcOfframpInitiateResponse>("/otc/offramp/transaction", data),

  getOnrampQuote: (data: OtcOnrampQuoteDto) =>
    api.post<{ rate: number }>("/otc/onramp/quote", data),

  getOfframpQuote: (data: OtcOfframpQuoteDto) =>
    api.post<{ rate: number }>("/otc/offramp/quote", data),

  executeOnramp: (data: OtcOnrampExecuteDto) =>
    api.post<{ data: { deposit: { bankCode: string; accountNumber: string; accountName: string; bankName: string }; transactionId: string } }>("/otc/onramp/execute", data),

  executeOfframp: (data: OtcOfframpExecuteDto) =>
    api.post<{ data: { deposit: { address: string; network: string; token: string }; transactionId: string } }>("/otc/offramp/execute", data),

  getStatus: (reference: string) =>
    api.get<OtcStatusResponse>(`/otc/status/${reference}`),

  getTransactions: () => api.get<OtcTransaction[]>("/otc/transactions"),

  getTransaction: (id: string) =>
    api.get<OtcTransaction>(`/otc/transaction/${id}`),

  getRate: (token: string = "USDC", network?: "base" | "bsc") => {
    const params = new URLSearchParams({ token });
    if (network) params.append("network", network);
    return api.get<{ rate: number }>(`/otc/rate?${params.toString()}`);
  },

  generateVirtualAccount: (data: { amount: number }) =>
    api.post<{ accountNumber: string; bankCode: string; accountName: string }>(
      "/otc/generate-virtual-account",
      data,
    ),

  checkIsOtcEnabled: () =>
    api.get<{ isOTCEnabled: boolean; isOnboarded: boolean; otcUser?: any }>(
      "/otc/isEnabled",
    ),
};

export interface InitializeSwapDto {
  amount: number; // NGN amount for offramp
  usdcAmount: number; // USDC amount for swap
  slippage: number;
  offrampDestination: {
    bankCode: string;
    accountNumber: string;
  };
  /** Wallet the USDC is sent from (0x address for base/bsc). Required by the backend. */
  sourceAddress: string;
  network?: string;
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
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOutMinimum?: string; // Optional since we removed getQuote
    recipient: string;
    slippage: number;
  };
}

export interface UpdateSwapDto {
  transactionHash: string;
  sourceAddress: string;
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
  initializeSwap: (data: InitializeSwapDto) =>
    api.post<SwapResponse>("/swap/initialize", data),
  createSimpleSwap: (data: CreateSimpleSwapDto) =>
    api.post<CreateSimpleSwapResponse>("/swap/create", data),

  updateSwapAfterExecution: (reference: string, data: UpdateSwapDto) =>
    api.post(`/swap/${reference}/complete`, data),

  getTokenBalance: (token: string, address: string) =>
    api.get<string>(`/swap/balance/${token}/${address}`),

  getTokenBalances: (address?: string) =>
    api.get<Record<string, string>>(
      `/swap/balances${address ? `?address=${address}` : ""}`,
    ),
};

// ============== Bridge API ==============

export interface InitiateBridgeDto {
  fromChain: string;
  toChain: string;
  amount: string;
  sourceAddress: string;
  destinationAddress: string;
  /** Off-ramp payout order this bridge funds (links funding + holds expiry). */
  offrampReference?: string;
  /** Record-only: the client executes the bridge with the user's wallet. */
  recordOnly?: boolean;
}

export interface InitiateBridgeResponse {
  reference: string;
  status: string;
}

export interface UpdateBridgeHashDto {
  reference: string;
  step: "SOURCE_TX" | "ATTESTATION" | "DESTINATION_TX";
  hash: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
}

export interface BridgeStatusResponse {
  reference: string;
  status: string;
  transactionHash: string;
  metadata: {
    SOURCE_TX?: string;
    DESTINATION_TX?: string;
    ATTESTATION?: string;
    [key: string]: any;
  };
}

/** One row of GET /bridge/history (backend: BridgeService.getTransferHistory). */
export interface BridgeHistoryItem {
  reference: string;
  status: string;
  fromChain: string;
  toChain: string;
  /** Stored as the client sent it: USDC base units (6 dp) from this app. */
  amount: string;
  /** Destination tx hash once delivered, otherwise the source tx hash. */
  transactionHash?: string | null;
  createdAt: string;
}

export interface BridgeHistoryResponse {
  total: number;
  transactions: BridgeHistoryItem[];
}

export interface StellarRelayResponse {
  status: "pending" | "minting" | "complete";
  mintTxHash?: string;
}

export const bridgeApi = {
  /** Backend relays a CCTP burn to Stellar (it holds the relayer key; the client only polls). */
  relayToStellar: (data: { burnTxHash: string; sourceDomain: number }) =>
    api.post<StellarRelayResponse>("/bridge/stellar-relay", data),

  /** Backend mints a Stellar burn on Base when the user's own wallet did not (the relayer pays the gas; the client only polls). */
  relayToEvm: (data: { burnTxHash: string }) => api.post<StellarRelayResponse>("/bridge/evm-relay", data),

  getHistory: () => api.get<BridgeHistoryResponse>("/bridge/history"),

  initiate: (data: InitiateBridgeDto) =>
    api.post<InitiateBridgeResponse>("/bridge/initiate", data),

  updateHash: (data: UpdateBridgeHashDto) =>
    api.post<{ success: boolean }>("/bridge/update-hash", data),

  getStatus: (reference: string) =>
    api.get<BridgeStatusResponse>(`/bridge/status/${reference}`),

  getSupportedChains: () =>
    api.get<{ chains: string[] }>("/bridge/supported-chains"),
};

export const miscApi = {
  /**
   * USD/NGN rate. With `network` + `direction` the backend returns the Bitnob rate for that chain
   * (onramp = buy, offramp = sell), which is what the provider actually pays; without them it
   * returns the legacy on-chain rate.
   */
  getUsdNgnRate: (
    amount?: number,
    opts?: { network?: string; direction?: "onramp" | "offramp"; country?: string },
  ) => {
    const q = new URLSearchParams();
    if (amount) q.set("amount", String(amount));
    if (opts?.network) q.set("network", opts.network);
    if (opts?.direction) q.set("direction", opts.direction);
    if (opts?.country && opts.country !== "NG") q.set("country", opts.country);
    const qs = q.toString();
    return api.get<{ rate: number; source?: string; country?: string; currency?: string }>(
      `/rates/usd-ngn-rate${qs ? `?${qs}` : ""}`,
    );
  },

  estimateNgn: (cngnAmount: number) =>
    api.get<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }>(
      `/rates/estimate-ngn?cngnAmount=${cngnAmount}`,
    ),
};

// ============== AutoRamp Data (public analytics) ==============

export interface DataStatsResponse {
  totalUsers: number;
  totalTransactions: number;
  merchantTransactions: number;
  onramps: number;
  offramps: number;
  swaps: number;
  bankTransfers: number;
  totalAmountTransacted: number;
  currency: string;
  activeMerchants: number;
  pendingVerifications: number;
  failedTransactions: number;
  totalTip?: number;
  totalTipUsd?: number;
  usdNgnRate?: number | null;
}

export const dataApi = {
  // Same-origin proxy (app/api/dashboard) — avoids backend CORS in the browser.
  // Authorized with the admin's bearer token. 401/403 if the session is not an admin session.
  getStats: (token: string) =>
    axios.get<DataStatsResponse>("/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    }),
};

// Redundant merchant definitions moved to merchant.ts
