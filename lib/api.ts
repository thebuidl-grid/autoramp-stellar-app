import axios, { AxiosError } from "axios";
import { useAuthStore } from "./store";

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
    // Get token from global store (synced with localStorage)
    const storeToken = useAuthStore.getState().token;

    // Fallback to direct localStorage if store is not yet initialized 
    const token = storeToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);

    if (token) {
      if (config.headers) {
        // Use the standard set method for AxiosHeaders in Axios 1.x
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${token}`);
        } else {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } else {
      // Debug log for missing token scenarios (only in dev)
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[API] No token found in store or localStorage for: ${config.url}`);
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
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
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
    api.post<{ success: boolean; message: string }>("/auth/otp/send", data),

  verifyOtp: (data: VerifyOtpDto) =>
    api.post<{ success: boolean; message: string }>("/auth/otp/verify", data),
};

// ============== Saved Accounts & Wallets Types ==============

export interface SavedAccountNumber {
  id: string;
  userId: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  createdAt: string;
  updatedAt: string;
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
  walletAddress: string;
  network: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserWalletDto {
  walletAddress: string;
  network: string;
  name?: string;
}

export interface UpdateUserWalletDto {
  name?: string;
}

// OTP verification for adding saved accounts
export interface InitiateAddAccountDto {
  accountNumber: string;
  bankCode: string;
}

export interface InitiateAddAccountResponse {
  success: boolean;
  message: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
}

export interface VerifyAndAddAccountDto {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  otpCode: string;
}

export const userApi = {
  getProfile: () =>
    api.get<User>("/user/profile"),

  // User API Keys
  getUserApiKeys: () => api.get<ApiKey[]>("/user/api-keys"),

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
    api.post<InitiateAddAccountResponse>("/user/saved-accounts/initiate", data),

  verifyAndAddAccount: (data: VerifyAndAddAccountDto) =>
    api.post<SavedAccountNumber>("/user/saved-accounts/verify-and-add", data),

  getSavedAccounts: () =>
    api.get<SavedAccountNumber[]>("/user/saved-accounts"),

  getSavedAccountById: (id: string) =>
    api.get<SavedAccountNumber>(`/user/saved-accounts/${id}`),

  updateSavedAccount: (id: string, data: UpdateSavedAccountDto) =>
    api.patch<SavedAccountNumber>(`/user/saved-accounts/${id}`, data),

  deleteSavedAccount: (id: string) =>
    api.delete(`/user/saved-accounts/${id}`),

  // User Wallets
  createUserWallet: (data: CreateUserWalletDto) =>
    api.post<UserWallet>("/user/wallets", data),

  getUserWallets: () =>
    api.get<UserWallet[]>("/user/wallets"),

  getUserWalletById: (id: string) =>
    api.get<UserWallet>(`/user/wallets/${id}`),

  updateUserWallet: (id: string, data: UpdateUserWalletDto) =>
    api.patch<UserWallet>(`/user/wallets/${id}`, data),

  deleteUserWallet: (id: string) =>
    api.delete(`/user/wallets/${id}`),
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
  getBanks: () =>
    api.get<{ status: string; message: string; data: Bank[] }>("/stablestack/banks"),

  resolveAccount: (bankCode: string, accountNumber: string) => {
    const params = new URLSearchParams();
    params.append("bankCode", bankCode);
    params.append("accountNumber", accountNumber);
    return api.get<ResolveAccountResponse>(`/stablestack/resolve-account?${params.toString()}`);
  },

  onRamp: (data: OnRampDto) =>
    api.post("/stablestack/onramp", data),

  offRamp: (data: OffRampDto) =>
    api.post("/stablestack/offramp", data),

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
  getMe: () =>
    api.get<AdminUser>("/admin/me"),

  getUsers: (page: number = 1, limit: number = 10) =>
    api.get<UsersResponse>(`/admin/users?page=${page}&limit=${limit}`),

  getUserById: (id: string) =>
    api.get<AdminUser>(`/admin/users/${id}`),

  createUser: (data: {
    email: string;
    phone_number?: string;
    wallet_address?: string;
    is_merchant?: boolean;
    is_api_access_approved?: boolean;
    contact_name?: string;
  }) => api.post<AdminUser>(`/admin/users`, data),

  updateUserProfile: (userId: string, data: Partial<{
    email: string;
    phone_number?: string;
    wallet_address?: string;
    contact_name?: string;
  }>) => api.patch<AdminUser>(`/admin/user/${userId}/profile`, data),

  suspendUser: (userId: string, data: { suspended: boolean }) =>
    api.patch<{ message: string }>(`/admin/user/${userId}/suspend`, data),

  updateUserFlags: (userId: string, data: { is_merchant?: boolean; is_api_access_approved?: boolean }) =>
    api.patch<AdminUser>(`/admin/user/${userId}/flags`, data),

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

  // Merchant Management
  getMerchants: () =>
    api.get<MerchantUser[]>("/merchants/onboarding"),

  getMerchantById: (id: string) =>
    api.get<MerchantUser>(`/merchants/onboarding/${id}`),

  updateMerchant: (id: string, data: any) =>
    api.patch<MerchantUser>(`/merchants/onboarding/${id}`, data),

  updateMerchantStatus: (id: string, data: { status: string; rejectionReason?: string }) =>
    api.patch<{ message: string; merchant?: MerchantUser }>(`/merchants/onboarding/${id}`, data),

  deleteMerchant: (id: string) =>
    api.delete(`/merchants/onboarding/${id}`),

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

  // Merchant Transactions
  getMerchantTransactionsOnramp: (merchantId: string, page: number = 1, limit: number = 10) =>
    api.get<TransactionsResponse>(`/merchants/${merchantId}/transactions/onramp?page=${page}&limit=${limit}`),

  getMerchantTransactionsOfframp: (merchantId: string, page: number = 1, limit: number = 10) =>
    api.get<TransactionsResponse>(`/merchants/${merchantId}/transactions/offramp?page=${page}&limit=${limit}`),

  getMerchantTransactionsSwap: (merchantId: string, page: number = 1, limit: number = 10) =>
    api.get<TransactionsResponse>(`/merchants/${merchantId}/transactions/swap?page=${page}&limit=${limit}`),

  getMerchantTransactionsSummary: (merchantId: string) =>
    api.get<any>(`/merchants/${merchantId}/transactions/summary`),
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

  getUsdNgnRate: () => api.get<{ rate: number }>("/swap/usd-ngn-rate"),

  estimateNgn: (cngnAmount: number) =>
    api.get<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }>(
      `/swap/estimate-ngn?cngnAmount=${cngnAmount}`,
    ),
};

// Redundant merchant definitions moved to merchant.ts
