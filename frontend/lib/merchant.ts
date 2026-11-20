import { api, Transaction, SwapTransaction, PaginatedResponse, TransactionsSummaryResponse, UnifiedTransactionsResponse, AuditLogsResponse, AuditLog } from "./api";

export type { AuditLog };

// ============== Webhook Types ==============

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  label: string;
  createdAt: string;
}

export interface CreateWebhookDto {
  url: string;
  label?: string;
}

export interface UpdateWebhookDto {
  url?: string;
  label?: string;
  active?: boolean;
}

/**
 * Merchant API Client
 *
 * Handles all merchant-specific operations including onboarding,
 * API key management, and business profile.
 */

// ============== Merchant Interfaces ==============

export interface MerchantBusinessDetailsDto {
  userId: string;
  name: string;
  natureOfBusiness?: string;
  description?: string;
  websiteUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  metadata?: any;
}

export interface MerchantDocumentationDto {
  merchantId: string;
  cacCertificate?: string;
  cacEStatus?: string;
  memart?: string;
  memorandum?: string;
  proofOfAddress?: string;
  capitalSource?: string;
  tradingName: string;
  taxIdentificationNumber?: string;
  proofOfFunds?: string;
  metadata?: any;
}

export interface MerchantDirectorDto {
  merchantId?: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
  bvn?: string;
  proofOfAddress?: string;
  idType?: string;
  idUrl?: string;
  metadata?: any;
}

export interface MerchantShareholderDto {
  merchantId?: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
  bvn?: string;
  proofOfAddress?: string;
  idType?: string;
  idUrl?: string;
  metadata?: any;
}

export interface MerchantBankAccountDto {
  merchantId: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  metadata?: any;
}

export interface CreateMerchantApiKeyDto {
  merchantId: string;
  name?: string;
  metadata?: any;
}

export interface UpdateMerchantApiKeyDto {
  name?: string;
  isActive?: boolean;
}

export interface MerchantApiKey {
  id: string;
  keyPrefix: string;
  name?: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface CreateMerchantApiKeyResponse extends MerchantApiKey {
  key: string;
  message: string;
}

// ============== Merchant API Object ==============

export const merchantApi = {
  // Onboarding
  submitBusinessDetails: (data: MerchantBusinessDetailsDto) =>
    api.post("/merchants/onboarding", data),

  submitDocumentation: (data: MerchantDocumentationDto) =>
    api.post("/merchants/documentations", data),

  submitDirector: (data: MerchantDirectorDto) =>
    api.post("/merchants/directors", data),

  submitShareholder: (data: MerchantShareholderDto) =>
    api.post("/merchants/shareholders", data),

  submitBankAccount: (data: MerchantBankAccountDto) =>
    api.post("/merchants/bank-accounts", data),

  // Directors Management
  updateDirector: (id: string, data: Partial<MerchantDirectorDto>) =>
    api.patch<{ message: string }>(`/merchants/directors/${id}`, data),

  removeDirector: (id: string) =>
    api.delete<{ message: string }>(`/merchants/directors/${id}`),

  // Shareholders Management
  updateShareholder: (id: string, data: Partial<MerchantShareholderDto>) =>
    api.patch<{ message: string }>(`/merchants/shareholders/${id}`, data),

  removeShareholder: (id: string) =>
    api.delete<{ message: string }>(`/merchants/shareholders/${id}`),

  // Status & Profile
  getMerchantStatus: () =>
    api.get<{
      onboardingStaus: "VERIFIED" | "PENDING" | "REJECTED" | null;
      hasMerchantRecord: boolean;
      merchantId: string | null;
    }>("/merchants/status"),

  getIsOnboarded: () =>
    api.get<{ isOnboarded: boolean }>("/merchants/onboarded"),

  getMerchantProfile: (merchantId?: string) =>
    api.get<any>(
      `/merchants/onboarding/profile${merchantId ? `?merchantId=${merchantId}` : ""}`,
    ),

  getDocumentation: (merchantId: string) =>
    api.get<any>(`/merchants/documentations?merchantId=${merchantId}`),

  getDirectors: (merchantId: string) =>
    api.get<any[]>(`/merchants/directors?merchantId=${merchantId}`),

  getShareholders: (merchantId: string) =>
    api.get<any[]>(`/merchants/shareholders?merchantId=${merchantId}`),

  getBankAccounts: (merchantId: string) =>
    api.get<any[]>(`/merchants/bank-accounts/${merchantId}`),

  // API Key Management (Merchant Specific)
  getApiKeys: (merchantId?: string) =>
    api.get<MerchantApiKey[]>(
      `/merchants/api-keys${merchantId ? `?merchantId=${merchantId}` : ""}`,
    ),

  createApiKey: (data: CreateMerchantApiKeyDto) =>
    api.post<CreateMerchantApiKeyResponse>("/merchants/api-keys", data),

  updateApiKey: (id: string, data: UpdateMerchantApiKeyDto) =>
    api.patch<MerchantApiKey>(`/merchants/api-keys/${id}`, data),

  revokeApiKey: (id: string) => api.delete(`/merchants/api-keys/${id}`),

  // Transactions & Analytics
  getTransactionsSummary: (merchantId: string) =>
    api.get<TransactionsSummaryResponse>(`/merchants/${merchantId}/transactions/summary`),

  getTransactionsUnified: (
    merchantId: string,
    opts?: { type?: string; page?: number; limit?: number },
  ) => {
    const query = new URLSearchParams();
    if (opts?.type) query.append("type", opts.type);
    if (opts?.page) query.append("page", opts.page.toString());
    if (opts?.limit) query.append("limit", opts.limit.toString());
    const qs = query.toString();
    return api.get<UnifiedTransactionsResponse>(
      `/merchants/${merchantId}/transactions${qs ? `?${qs}` : ""}`,
    );
  },

  getTransactionsAnalytics: (merchantId: string, period: string = "daily") =>
    api.get<any>(
      `/merchants/${merchantId}/transactions/analytics?period=${period}`,
    ),

  getTransactionsOnramp: (
    merchantId: string,
    page: number = 1,
    limit: number = 10,
  ) =>
    api.get<PaginatedResponse<Transaction>>(
      `/merchants/${merchantId}/transactions/onramp?page=${page}&limit=${limit}`,
    ),

  getTransactionsOfframp: (
    merchantId: string,
    page: number = 1,
    limit: number = 10,
  ) =>
    api.get<PaginatedResponse<Transaction>>(
      `/merchants/${merchantId}/transactions/offramp?page=${page}&limit=${limit}`,
    ),

  getTransactionsSwap: (
    merchantId: string,
    page: number = 1,
    limit: number = 10,
  ) =>
    api.get<PaginatedResponse<SwapTransaction>>(
      `/merchants/${merchantId}/transactions/swap?page=${page}&limit=${limit}`,
    ),

  // Profile Updates
  updateBusinessDetails: (
    id: string,
    data: Partial<MerchantBusinessDetailsDto>,
  ) => api.patch<{ message: string }>(`/merchants/onboarding/${id}`, data),

  updateDocumentation: (id: string, data: Partial<MerchantDocumentationDto>) =>
    api.patch<{ message: string }>(`/merchants/documentations/${id}`, data),

  updateBankAccount: (id: string, data: Partial<MerchantBankAccountDto>) =>
    api.patch<{ message: string }>(`/merchants/bank-accounts/${id}`, data),

  // Webhook Management (multi-webhook)
  listWebhooks: (merchantId: string) =>
    api.get<Webhook[]>(`/merchants/${merchantId}/settings/webhooks`),

  createWebhook: (merchantId: string, data: CreateWebhookDto) =>
    api.post<Webhook>(`/merchants/${merchantId}/settings/webhooks`, data),

  updateWebhook: (merchantId: string, webhookId: string, data: UpdateWebhookDto) =>
    api.patch<Webhook>(`/merchants/${merchantId}/settings/webhooks/${webhookId}`, data),

  deleteWebhook: (merchantId: string, webhookId: string) =>
    api.delete<{ deleted: boolean }>(`/merchants/${merchantId}/settings/webhooks/${webhookId}`),

  rotateWebhookSecret: (merchantId: string, webhookId: string) =>
    api.post<{ webhookId: string; secret: string }>(
      `/merchants/${merchantId}/settings/webhooks/${webhookId}/rotate-secret`,
    ),
};

// ============== Public Merchant API Object ==============

export interface MerchantOnboardingResponse {
  id: string;
  userId: string;
  name: string;
  status: string;
}

export interface CreateDirectorDto {
  merchantId: string;
  firstName: string;
  lastName: string;
  nationality: string;
  bvn: string;
  proofOfAddress: string;
  idType: string;
  idUrl: string;
  metadata: {
    role: string;
  };
}

// ============== Merchant Bank API Types ==============

export interface MerchantBankAccountResponse {
  accountId: string;
  accountNumber: string;
  bankCode: string;
  accountBalance: number;
  bookBalance: number;
  accountName: string;
  status: string;
  provider?: "SafeHaven" | "PULSE_MFB";
  raw?: any;
}

export interface CreateSubAccountDto {
  phoneNumber: string;
  emailAddress: string;
  externalReference: string;
  identityType?: "BVN" | "NIN" | "vNIN" | "BVNUSSD" | "CAC" | "CREDITCHECK";
  identityNumber?: string;
  otp?: string;
  callbackUrl?: string;
  autoSweep?: boolean;
}

export interface UpdateSubAccountDto {
  autoSweep?: boolean;
  autoSweepDetails?: { callbackUrl: string };
  callbackUrl?: string;
}

export interface SubAccount {
  id: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  autoSweep?: boolean;
  metadata?: any;
  createdAt: string;
}

export interface SubAccountDetail {
  id: string;
  safehavenId?: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  bankName?: string;
  accountBalance: number;
  bookBalance: number;
  status: string;
  raw?: any;
}

export interface NameEnquiryDto {
  bankCode: string;
  accountNumber: string;
}

export interface NameEnquiryResponse {
  data: {
    accountName: string;
    bankCode: string;
    accountNumber: string;
  };
}

export interface TransferDto {
  beneficiaryBankCode: string;
  beneficiaryAccountNumber: string;
  amount: number;
  narration: string;
  paymentReference: string;
  saveBeneficiary?: boolean;
  debitAccountNumber?: string;
}

export interface TransferQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  from_date?: string;
  to_date?: string;
  sub_account_id?: string;
  merchantId?: string;
}

export interface CreateVirtualAccountDto {
  amount: number;
  validFor?: number;
  externalReference?: string;
  amountControl?: "Fixed" | "UnderPayment" | "OverPayment";
  callbackUrl?: string;
}

export interface VerifyIdentityDto {
  type: "BVN" | "NIN" | "vNIN" | "BVNUSSD" | "CAC" | "CREDITCHECK";
  number: string;
  otp?: string;
  verifierId?: string;
}

export interface ValidateIdentityDto {
  identityId: string;
  type: "BVN" | "NIN";
  otp: string;
}

export interface MerchantBankAnalyticsDataPoint {
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

export interface MerchantBankStats {
  period: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  onramp: { count: number; totalAmount: number; totalFees: number };
  offramp: { count: number; totalAmount: number; totalFees: number };
  swap: { count: number; totalFromAmount: number; totalToAmount: number; totalFees: number };
  bankTransfer: { count: number; totalAmount: number; totalFees: number };
  vas: { count: number; totalAmount: number; totalFees: number };
  fees: {
    provider_fee: number;
    vat: number;
    stamp_duty: number;
    platform_fee: number;
    total: number;
  };
  netVolume: number;
  transferCount: number;
  totalMoneyMoved: number;
  recentRequests: Array<{
    method: string;
    path: string;
    statusCode: number;
    createdAt: string;
  }>;
  recentTransfers: Array<{
    amount: number;
    beneficiaryAccountNumber: string;
    beneficiaryBankCode: string;
    narration: string;
    createdAt: string;
  }>;
}

export interface BankListItem {
  institutionCode: string;
  institutionName: string;
}

export interface MerchantBankTransaction {
  id: string;
  reference: string;
  amount: number;
  tokenType: string;
  status: string;
  type: "onramp" | "offramp" | "swap";
  createdAt: string;
  completedAt?: string;
  // onramp
  tokenAmount?: number;
  destinationAddress?: string;
  network?: string;
  // offramp
  fiatAmount?: number;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  // swap
  fromTokenType?: string;
  fromAmount?: number;
  toTokenType?: string;
  toAmount?: number;
  exchangeRate?: number;
  transactionHash?: string;
}

export interface MerchantBankTransactionsResponse {
  data: MerchantBankTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WebhookLog {
  id: string;
  event: string;
  url: string | null;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  createdAt: string;
}

export interface WebhookLogsResponse {
  data: WebhookLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============== Merchant Bank Dashboard API (JWT) ==============

export const merchantBankApi = {
  // Account
  getAccount: (merchantId?: string) => {
    const qs = merchantId ? `?merchantId=${merchantId}` : "";
    return api.get<MerchantBankAccountResponse>(`/merchants/bank/account${qs}`);
  },

  // Sub-Accounts
  getSubAccounts: (merchantId?: string) => {
    const qs = merchantId ? `?merchantId=${merchantId}` : "";
    return api.get<SubAccount[]>(`/merchants/bank/sub-accounts${qs}`);
  },

  getSubAccount: (id: string, merchantId?: string) => {
    const qs = merchantId ? `?merchantId=${merchantId}` : "";
    return api.get<SubAccountDetail>(`/merchants/bank/sub-accounts/${id}${qs}`);
  },

  getSubAccountTransfers: (id: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.status) query.append("status", params.status);
    if (params?.fromDate) query.append("fromDate", params.fromDate);
    if (params?.toDate) query.append("toDate", params.toDate);
    const queryString = query.toString();
    return api.get<any>(
      `/merchants/bank/sub-accounts/${id}/transfers${queryString ? `?${queryString}` : ""}`,
    );
  },

  getSubAccountTransactions: (id: string, params?: {
    page?: number;
    limit?: number;
    type?: "onramp" | "offramp" | "swap";
    status?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.type) query.append("type", params.type);
    if (params?.status) query.append("status", params.status);
    const queryString = query.toString();
    return api.get<MerchantBankTransactionsResponse>(
      `/merchants/bank/sub-accounts/${id}/transactions${queryString ? `?${queryString}` : ""}`,
    );
  },

  // Transfers
  getTransfers: (params?: TransferQueryParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.status) query.append("status", params.status);
    if (params?.from_date) query.append("from_date", params.from_date);
    if (params?.to_date) query.append("to_date", params.to_date);
    if (params?.sub_account_id) query.append("sub_account_id", params.sub_account_id);
    if (params?.merchantId) query.append("merchantId", params.merchantId);
    const queryString = query.toString();
    return api.get<any>(
      `/merchants/bank/transfers${queryString ? `?${queryString}` : ""}`,
    );
  },

  // Transactions (crypto onramp/offramp/swap)
  getTransactions: (params?: {
    page?: number;
    limit?: number;
    type?: "onramp" | "offramp" | "swap";
    status?: string;
    sub_account_id?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.type) query.append("type", params.type);
    if (params?.status) query.append("status", params.status);
    if (params?.sub_account_id) query.append("sub_account_id", params.sub_account_id);
    const queryString = query.toString();
    return api.get<MerchantBankTransactionsResponse>(
      `/merchants/bank/transactions${queryString ? `?${queryString}` : ""}`,
    );
  },

  // Stats
  getStats: () =>
    api.get<MerchantBankStats>("/merchants/bank/stats"),

  // Analytics
  getAnalytics: (period?: "daily" | "weekly" | "monthly") =>
    api.get<MerchantBankAnalyticsDataPoint[]>(
      `/merchants/bank/analytics${period ? `?period=${period}` : ""}`,
    ),

  // Webhook Logs
  getWebhookLogs: (params?: {
    page?: number;
    limit?: number;
    event?: string;
    success?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.event) query.append("event", params.event);
    if (params?.success !== undefined) query.append("success", params.success.toString());
    const queryString = query.toString();
    return api.get<WebhookLogsResponse>(
      `/merchants/webhook-logs${queryString ? `?${queryString}` : ""}`,
    );
  },

  retryWebhookLog: (logId: string) =>
    api.post<{ success: boolean; statusCode: number }>(
      `/merchants/webhook-logs/${logId}/retry`,
    ),

  getWebhookLogDetail: (logId: string) =>
    api.get<WebhookLog & { payload: unknown; response: unknown; retryCount: number; maxRetries: number; nextRetryAt: string | null }>(
      `/merchants/webhook-logs/${logId}`,
    ),

  // Audit Logs
  getAuditLogs: (params?: { action?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.action) query.append("action", params.action);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    const qs = query.toString();
    return api.get<AuditLogsResponse>(`/merchants/bank/audit-logs${qs ? `?${qs}` : ""}`);
  },

  // Banks (SafeHaven only)
  getBanks: () =>
    api.get<BankListItem[]>("/merchants/bank/banks"),

  // Write Operations (all under /merchants/bank/*)

  // Name Enquiry
  nameEnquiry: (data: NameEnquiryDto) =>
    api.post<NameEnquiryResponse>("/merchants/bank/name-enquiry", data),

  // Transfer
  transfer: (data: TransferDto) =>
    api.post<any>("/merchants/bank/transfer", data),

  // Sub-Account
  createSubAccount: (data: CreateSubAccountDto) =>
    api.post<any>("/merchants/bank/sub-account", data),

  updateSubAccount: (id: string, data: UpdateSubAccountDto, merchantId?: string) => {
    const qs = merchantId ? `?merchantId=${merchantId}` : "";
    return api.patch<any>(`/merchants/bank/sub-accounts/${id}${qs}`, data);
  },

  // Virtual Account (SafeHaven only)
  createVirtualAccount: (data: CreateVirtualAccountDto) =>
    api.post<any>("/merchants/bank/virtual-account", data),

  // Identity Verification (SafeHaven only)
  initiateVerification: (data: VerifyIdentityDto) =>
    api.post<any>("/merchants/bank/initiate-verification", data),

  validateVerification: (data: ValidateIdentityDto) =>
    api.post<any>("/merchants/bank/validate-verification", data),
};

// ============== VAS (Value Added Services) ==============

export interface VASService {
  _id: string;
  name: string;
  description: string;
}

export interface VASCategory {
  _id: string;
  name: string;
  serviceId: string;
  [key: string]: any;
}

export interface VASProduct {
  code: string;
  name: string;
  amount: number;
  [key: string]: any;
}

export interface VASVerifyRequest {
  serviceCategoryId: string;
  entityNumber: string;
}

export interface VASVerifyResponse {
  customerName?: string;
  meterDetails?: any;
  [key: string]: any;
}

export interface VASPayAirtimeRequest {
  serviceCategoryId: string;
  amount: number;
  debitAccountNumber: string;
  phoneNumber: string;
  channel?: string;
  statusUrl?: string;
}

export interface VASPayDataRequest {
  serviceCategoryId: string;
  bundleCode: string;
  amount: number;
  debitAccountNumber: string;
  phoneNumber: string;
  channel?: string;
  statusUrl?: string;
}

export interface VASPayCableTvRequest {
  serviceCategoryId: string;
  bundleCode: string;
  amount: number;
  debitAccountNumber: string;
  cardNumber: string;
  channel?: string;
  statusUrl?: string;
}

export interface VASPayUtilityRequest {
  serviceCategoryId: string;
  amount: number;
  debitAccountNumber: string;
  meterNumber: string;
  vendType?: string;
  channel?: string;
  statusUrl?: string;
}

export interface VASTransaction {
  id: string;
  reference: string;
  serviceType: string;
  amount: number;
  currency: string;
  status: string;
  phoneNumber?: string;
  debitAccountNumber?: string;
  cardNumber?: string;
  meterNumber?: string;
  bundleCode?: string;
  serviceCategoryId?: string;
  providerResponse?: any;
  createdAt: string;
  completedAt?: string;
}

export interface VASTransactionResponse {
  data: VASTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const merchantVasApi = {
  getServices: () =>
    api.get<VASService[]>("/vas/services"),

  getService: (serviceId: string) =>
    api.get<VASService>(`/vas/services/${serviceId}`),

  getCategories: (serviceId: string) =>
    api.get<VASCategory[]>(`/vas/services/${serviceId}/categories`),

  getProducts: (categoryId: string) =>
    api.get<VASProduct[]>(`/vas/categories/${categoryId}/products`),

  verify: (data: VASVerifyRequest) =>
    api.post<VASVerifyResponse>("/vas/verify", data),

  payAirtime: (data: VASPayAirtimeRequest) =>
    api.post<any>("/vas/pay/airtime", data),

  payData: (data: VASPayDataRequest) =>
    api.post<any>("/vas/pay/data", data),

  payCableTv: (data: VASPayCableTvRequest) =>
    api.post<any>("/vas/pay/cable-tv", data),

  payUtility: (data: VASPayUtilityRequest) =>
    api.post<any>("/vas/pay/utility", data),

  getTransactions: (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    const qs = query.toString();
    return api.get<VASTransactionResponse>(`/vas/transactions${qs ? `?${qs}` : ""}`);
  },

  getTransaction: (transactionId: string) =>
    api.get<VASTransaction>(`/vas/transactions/${transactionId}`),

  syncTransaction: (transactionId: string) =>
    api.post<VASTransaction>(`/vas/transactions/${transactionId}/sync`),
};

// ============== Public Merchant API ==============

export const publicMerchantApi = {
  // Stage 1: Create Merchant
  createMerchant: (data: any) =>
    api.post<MerchantOnboardingResponse>(`/merchants/onboarding`, data),

  // Stage 2: Upload Documents & Complete Info
  completeMerchantKYB: (data: any) =>
    api.post<{ message: string }>(`/merchants/documentations`, data),

  // Stage 3: Add Merchant Director
  addMerchantDirector: (data: CreateDirectorDto) =>
    api.post<{ message: string }>(`/merchants/directors`, data),
};
