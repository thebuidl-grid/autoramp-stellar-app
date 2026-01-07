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
  signUp: (data: SignUpDto) => api.post<AuthResponse>("/auth/signup", data),

  signIn: (data: SignInDto) => api.post<AuthResponse>("/auth/signin", data),

  adminLogin: (data: SignInDto) =>
    api.post<AuthResponse>("/auth/admin/login", data),

  sendOtp: (data: SendOtpDto) =>
    api.post<{ success: boolean; message: string }>("/auth/otp/send", data),

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
  getProfile: () => api.get<User>("/user/profile"),
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
}

export interface CreateApiKeyResponse extends ApiKey {
  key: string;
  message: string;
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

export const adminApi = {
  getUsers: (page: number = 1, limit: number = 10) =>
    api.get<UsersResponse>(`/admin/users?page=${page}&limit=${limit}`),

  getUserById: (id: string) => api.get<AdminUser>(`/admin/users/${id}`),

  // API Key Management
  getAllApiKeys: (page: number = 1, limit: number = 10) =>
    api.get<ApiKeysResponse>(`/admin/api-keys?page=${page}&limit=${limit}`),

  getUserApiKeys: (userId: string) =>
    api.get<ApiKey[]>(`/admin/users/${userId}/api-keys`),

  createApiKeyForUser: (userId: string, data: CreateApiKeyDto) =>
    api.post<CreateApiKeyResponse>(`/admin/users/${userId}/api-keys`, data),

  revokeApiKey: (id: string) =>
    api.delete<{ message: string }>(`/admin/api-keys/${id}`),

  // Admin Transactions
  getAdminOnRampTransactions: (reference?: string) => {
    const params = new URLSearchParams();
    if (reference) params.append("reference", reference);
    return api.get<AdminTransactionsResponse>(
      `/admin/transactions/onramps?${params.toString()}`,
    );
  },

  getAdminOffRampTransactions: (reference?: string) => {
    const params = new URLSearchParams();
    if (reference) params.append("reference", reference);
    return api.get<AdminTransactionsResponse>(
      `/admin/transactions/offramps?${params.toString()}`,
    );
  },

  getAdminSwapTransactions: (reference?: string) => {
    const params = new URLSearchParams();
    if (reference) params.append("reference", reference);
    return api.get<AdminTransactionsResponse>(
      `/admin/transactions/swaps?${params.toString()}`,
    );
  },
  getAdminTransactionSummary: () =>
    api.get<AdminTransactionSummaryResponse>(`/admin/transactions/summary`),

  getAnalytics: (period: "daily" | "weekly" | "monthly" = "daily") =>
    api.get<AnalyticsDataPoint[]>(
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
