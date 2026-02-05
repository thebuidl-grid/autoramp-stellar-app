import { api, Transaction, SwapTransaction, PaginatedResponse } from "./api";

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
    webhookUrl?: string;
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
        api.get<{ onboardingStaus: "VERIFIED" | "PENDING" | "REJECTED" | null; hasMerchantRecord: boolean; merchantId: string | null }>("/merchants/status"),

    getIsOnboarded: () =>
        api.get<{ isOnboarded: boolean }>("/merchants/onboarded"),

    getMerchantProfile: (merchantId?: string) =>
        api.get<any>(`/merchants/onboarding/profile${merchantId ? `?merchantId=${merchantId}` : ""}`),

    getDocumentation: (merchantId: string) =>
        api.get<any>(`/merchants/documentations?merchantId=${merchantId}`),

    getDirectors: (merchantId: string) =>
        api.get<any[]>(`/merchants/directors?merchantId=${merchantId}`),

    getShareholders: (merchantId: string) =>
        api.get<any[]>(`/merchants/shareholders?merchantId=${merchantId}`),

    getBankAccounts: (merchantId: string) =>
        api.get<any[]>(`/merchants/bank-accounts?merchantId=${merchantId}`),

    // API Key Management (Merchant Specific)
    getApiKeys: (merchantId?: string) =>
        api.get<MerchantApiKey[]>(`/merchants/api-keys${merchantId ? `?merchantId=${merchantId}` : ""}`),

    createApiKey: (data: CreateMerchantApiKeyDto) =>
        api.post<CreateMerchantApiKeyResponse>("/merchants/api-keys", data),

    updateApiKey: (id: string, data: UpdateMerchantApiKeyDto) =>
        api.patch<MerchantApiKey>(`/merchants/api-keys/${id}`, data),

    revokeApiKey: (id: string) =>
        api.delete(`/merchants/api-keys/${id}`),

    // Transactions & Analytics
    getTransactionsSummary: (merchantId: string) =>
        api.get<any>(`/merchants/${merchantId}/transactions/summary`),

    getTransactionsAnalytics: (merchantId: string, period: string = "daily") =>
        api.get<any>(`/merchants/${merchantId}/transactions/analytics?period=${period}`),

    getTransactionsOnramp: (merchantId: string, page: number = 1, limit: number = 10) =>
        api.get<PaginatedResponse<Transaction>>(`/merchants/${merchantId}/transactions/onramp?page=${page}&limit=${limit}`),

    getTransactionsOfframp: (merchantId: string, page: number = 1, limit: number = 10) =>
        api.get<PaginatedResponse<Transaction>>(`/merchants/${merchantId}/transactions/offramp?page=${page}&limit=${limit}`),

    getTransactionsSwap: (merchantId: string, page: number = 1, limit: number = 10) =>
        api.get<PaginatedResponse<SwapTransaction>>(`/merchants/${merchantId}/transactions/swap?page=${page}&limit=${limit}`),

    // Profile Updates
    updateBusinessDetails: (id: string, data: Partial<MerchantBusinessDetailsDto>) =>
        api.patch<{ message: string }>(`/merchants/onboarding/${id}`, data),

    updateDocumentation: (id: string, data: Partial<MerchantDocumentationDto>) =>
        api.patch<{ message: string }>(`/merchants/documentations/${id}`, data),

    updateBankAccount: (id: string, data: Partial<MerchantBankAccountDto>) =>
        api.patch<{ message: string }>(`/merchants/bank-accounts/${id}`, data),

    getWebhookUrl: (merchantId: string) =>
        api.get<{ webhookUrl: string }>(`/merchants/${merchantId}/settings/webhook`),

    updateWebhookUrl: (merchantId: string, webhookUrl: string) =>
        api.patch<{ webhookUrl: string }>(`/merchants/${merchantId}/settings/webhook`, { webhookUrl }),
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
    }
}

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
