import axios, { AxiosError } from "axios";
import { useAuthStore } from "./store";

/**
 * API Configuration
 *
 * Base API client for communicating with the backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
  };
}

export interface OffRampDto {
  network: string;
  type?: string;
  amount: number;
  destination: {
    bankCode: string;
    accountNumber: string;
  };
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

export interface PlatformTransaction {
  id: string;
  reference: string;
  amount: string;
  status: string;
  createdAt: string;
  _type: "onramp" | "offramp" | "swap";
  userEmail: string;
}

export interface TransactionsResponse {
  data: PlatformTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  getBanks: () =>
    api.get<{ status: string; message: string; data: Bank[] }>("/misc/banks"),

  resolveAccount: (bankCode: string, accountNumber: string) => {
    const params = new URLSearchParams();
    params.append("bankCode", bankCode);
    params.append("accountNumber", accountNumber);
    return api.get<ResolveAccountResponse>(
      `/misc/resolve-account?${params.toString()}`,
    );
  },

  onRamp: (data: OnRampDto) => api.post("/ramp/onramp", data),

  offRamp: (data: OffRampDto) => api.post("/ramp/offramp", data),

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
  name: string;
  phone: string;
  bvn: string;
  tin?: string;
  taxIdentificationNumber?: string;
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
  webhookUrl?: string;
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

  // API Key Management
  getAllApiKeys: (page: number = 1, limit: number = 10) =>
    api.get<ApiKeysResponse>(`/admin/api-keys?page=${page}&limit=${limit}`),

  getMerchantApiKeys: (merchantId: string) =>
    api.get<ApiKey[]>(`/merchants/api-keys/?merchantId=${merchantId}`),

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

  getTransactions: (page: number = 1, limit: number = 10, status?: string, type?: string, search?: string) =>
    api.get<TransactionsResponse>(
      `/admin/platform-transactions?page=${page}&limit=${limit}${status ? `&status=${status}` : ""}${type ? `&type=${type}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    ),

  getTransactionsSummary: () =>
    api.get<TransactionsSummaryResponse>("/admin/transactions/summary"),

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

  // OTC User Management
  getOtcUsers: (page: number = 1, limit: number = 10) =>
    api.get<UsersResponse>(
      `/admin/users?page=${page}&limit=${limit}&isOTCEnabled=true`,
    ),

  // OTC Transactions Management
  getOtcTransactions: (
    page: number = 1,
    limit: number = 10,
    status?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
  ) => {
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    if (status) params.append("status", status);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (search) params.append("search", search);
    return api.get<{
      transactions: any[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/admin/otc/transactions?${params.toString()}`);
  },

  getOtcSwapPrice: (
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    takerAddress?: string,
  ) => {
    const params = new URLSearchParams();
    params.append("sellToken", sellToken);
    params.append("buyToken", buyToken);
    params.append("sellAmount", sellAmount);
    if (takerAddress) params.append("takerAddress", takerAddress);
    return api.get<any>(`/admin/otc/swap-price?${params.toString()}`);
  },

  getOtcSwapQuote: (
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    takerAddress: string,
  ) => {
    const params = new URLSearchParams();
    params.append("sellToken", sellToken);
    params.append("buyToken", buyToken);
    params.append("sellAmount", sellAmount);
    params.append("takerAddress", takerAddress);
    return api.get<any>(`/admin/otc/swap-quote?${params.toString()}`);
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
  network: string;
  chain?: string;
  address: string;
  memo?: string;
}

export interface OtcTransaction extends Transaction {
  quantity: number;
  token: string;
  network: string;
  chain?: string;
  address: string;
  memo?: string;

  // New fields from updated contract
  fiatAmountReceived?: number;
  systemFee?: number;
  networkFee?: number;
  feeCollected?: number;
  tokenAmountSent?: number;
  rate?: number;
  meta?: {
    quote?: {
      rate: number;
      totalAmount: number;
    };
  };
  issuance?: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
  };
  note?: string[];
}

// ============== API Groups ==============

export const otcApi = {
  onboard: (data: OnboardOtcDto) =>
    api.post<{ success: boolean; message: string }>("/otc/onboard", data),

  initiate: (data: InitiateOtcTransactionDto) =>
    api.post<OtcTransaction>("/otc/transaction", data),

  getStatus: (reference: string) =>
    api.get<OtcTransaction>(`/otc/status/${reference}`),

  getTransactions: () => api.get<OtcTransaction[]>("/otc/transactions"),

  getTransaction: (id: string) =>
    api.get<OtcTransaction>(`/otc/transaction/${id}`),

  getRate: (token: string = "USDC") =>
    api.get<{ rate: number }>(`/otc/rate?token=${token}`),

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

export const bridgeApi = {
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
  getUsdNgnRate: (amount?: number) =>
    api.get<{ rate: number }>(
      `/rates/usd-ngn-rate${amount ? `?amount=${amount}` : ""}`,
    ),

  estimateNgn: (cngnAmount: number) =>
    api.get<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }>(
      `/rates/estimate-ngn?cngnAmount=${cngnAmount}`,
    ),
};

// Redundant merchant definitions moved to merchant.ts
