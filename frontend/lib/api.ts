import axios, { AxiosError } from "axios";

/**
 * API Configuration
 * 
 * Base API client for communicating with the backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
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
          window.location.href = "/auth/signin";
        }
      }
    }
    return Promise.reject(error);
  }
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
  password: string;
  phoneNumber: string;
  otpCode: string;
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
  getProfile: () => 
    api.get<User>("/user/profile"),
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
  reference: string;
  amount: number;
  currency?: string;
  tokenAmount?: number;
  fiatAmount?: number;
  tokenType?: string;
  status: string;
  flintTransactionId?: string;
  destinationAddress?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  network?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  depositAddress?: string;
  depositAccount?: any;
  metadata?: any;
}

export interface TransactionsResponse {
  onramp: Transaction[];
  offramp: Transaction[];
  total: number;
}

export const stablestackApi = {
  getBanks: () => 
    api.get<{ status: string; message: string; data: Bank[] }>("/stablestack/banks"),
  
  onRamp: (data: OnRampDto) => 
    api.post("/stablestack/onramp", data),
  
  offRamp: (data: OffRampDto) => 
    api.post("/stablestack/offramp", data),
  
  getTransactions: (id?: string, reference?: string) => {
    const params = new URLSearchParams();
    if (id) params.append("id", id);
    if (reference) params.append("reference", reference);
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

export const adminApi = {
  getUsers: (page: number = 1, limit: number = 10) => 
    api.get<UsersResponse>(`/admin/users?page=${page}&limit=${limit}`),
  
  getUserById: (id: string) => 
    api.get<AdminUser>(`/admin/users/${id}`),
  
  // API Key Management
  getAllApiKeys: (page: number = 1, limit: number = 10) => 
    api.get<ApiKeysResponse>(`/admin/api-keys?page=${page}&limit=${limit}`),
  
  getUserApiKeys: (userId: string) => 
    api.get<ApiKey[]>(`/admin/users/${userId}/api-keys`),
  
  createApiKeyForUser: (userId: string, data: CreateApiKeyDto) => 
    api.post<CreateApiKeyResponse>(`/admin/users/${userId}/api-keys`, data),
  
  revokeApiKey: (id: string) => 
    api.delete<{ message: string }>(`/admin/api-keys/${id}`),
};

