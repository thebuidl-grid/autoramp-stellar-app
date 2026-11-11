export interface TransferData {
  beneficiaryBankCode: string;
  beneficiaryAccountNumber: string;
  amount: number;
  narration: string;
  paymentReference: string;
  saveBeneficiary?: boolean;
  debitAccountNumber?: string;
}

export interface CreateAccountData {
  accountType?: 'Savings' | 'Current';
  suffix?: string;
  metadata?: any;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  reference?: string;
  phoneNumber?: string;
  emailAddress?: string;
  externalReference?: string;
  identityType?: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';
  identityNumber?: string;
  identityId?: string;
  otp?: string;
  autoSweep?: boolean;
  callbackUrl?: string;
}

export interface BalanceData {
  accountNumber: string;
}

export interface NameEnquiryData {
  bankCode: string;
  accountNumber: string;
}

export interface SubAccountData {
  subAccountId: string;
}

export interface CreateSubAccountData {
  phoneNumber: string;
  emailAddress: string;
  externalReference: string;
  identityType: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';
  identityNumber?: string;
  identityId?: string;
  otp?: string;
  autoSweep?: boolean;
  callbackUrl?: string;
}

export interface GetTransfersData {
  accountId?: string;
  accountNumber?: string;
  page?: number;
  limit?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

export interface InitiateVerificationData {
  type: 'BVN' | 'NIN' | 'vNIN' | 'BVNUSSD' | 'CAC' | 'CREDITCHECK';
  number: string;
  debitAccountNumber: string;
  otp?: string;
  verifierId?: string;
  provider?: string;
  async?: boolean;
}

export interface ValidateVerificationData {
  identityId: string;
  type: 'BVN' | 'NIN';
  otp: string;
}

export interface UpdateSubAccountData {
  subAccountId: string;
  phoneNumber: string;
  emailAddress: string;
  externalReference: string;
  identityType: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';
  identityNumber?: string;
  identityId?: string;
  otp?: string;
  metadata?: Record<string, unknown>;
  autoSweep?: boolean;
  autoSweepDetails?: {
    callbackUrl?: string;
  };
  callbackUrl?: string;
}
