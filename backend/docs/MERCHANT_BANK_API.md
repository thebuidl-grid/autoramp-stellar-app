# Merchant Banking API — Frontend Integration Guide

## Route Structure

Three route groups with strict auth separation:

| Route Group | Base Path | Auth | Use Case |
|-------------|-----------|------|----------|
| Dashboard | `/merchants/bank/*` | JWT only | Frontend web app |
| API | `/merchants/api/*` | API Key only | Server-to-server integrations |
| Admin | `/admin/*` | Admin JWT only | Internal admin panel |

---

## Provider Location

`fiatProvider` lives on the **bank account** layer (`merchant.bankAccount.fiatProvider`), NOT on the merchant.

The onboarding endpoints (`GET /onboarding`, `GET /onboarding/:id`) include `bankAccount` in the response. The frontend reads the provider from:

```ts
merchant.bankAccount?.fiatProvider  // e.g. "PULSE_MFB" | "SAFEHAVEN"
```

Each bank account has its own provider. A merchant can have a Pulse MFB bank account and a SafeHaven bank account simultaneously.

---

## Dashboard Routes — `/merchants/bank/*`

Auth: `Authorization: Bearer <jwt_token>` (JWT only)

### GET `/merchants/bank/account`

Get the merchant's main bank account balance and details.

**Response:**
```json
{
  "accountId": "safehaven-or-pulse-id",
  "accountNumber": "0123456789",
  "bankCode": "058",
  "accountBalance": 50000,
  "bookBalance": 50000,
  "accountName": "My Business",
  "status": "active",
  "raw": { ... }
}
```

---

### GET `/merchants/bank/banks`

Get list of supported banks. **SafeHaven only** — returns error for Pulse MFB merchants.

**Response:**
```json
[
  { "institutionCode": "044", "institutionName": "Access Bank" },
  { "institutionCode": "011", "institutionName": "First Bank of Nigeria" }
]
```

---

### GET `/merchants/bank/sub-accounts`

List all sub-accounts for this merchant.

**Response:**
```json
[
  {
    "id": "uuid",
    "bankCode": "058",
    "accountNumber": "0123456789",
    "accountName": "John Doe",
    "bankName": "Pulse MFB",
    "metadata": { ... },
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

### GET `/merchants/bank/sub-accounts/:id`

Get a single sub-account's balance and details.

**Response:**
```json
{
  "id": "uuid",
  "safehavenId": "provider-id",
  "bankCode": "058",
  "accountNumber": "0123456789",
  "accountName": "John Doe",
  "accountBalance": 10000,
  "bookBalance": 10000,
  "status": "active",
  "raw": { ... }
}
```

---

### GET `/merchants/bank/sub-accounts/:subAccountId/transfers`

Get transfer history for a specific sub-account.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `status` | string | No | Filter by status |
| `fromDate` | string (ISO) | No | Start date |
| `toDate` | string (ISO) | No | End date |

---

### GET `/merchants/bank/sub-accounts/:subAccountId/transactions`

Get onramp/offramp/swap transaction history for a specific sub-account.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `type` | enum | No | `onramp` \| `offramp` \| `swap` |
| `status` | string | No | Filter by status |

**Response:** Same structure as `/merchants/bank/transactions`.

---

### GET `/merchants/bank/transfers`

Get bank transfer history.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `status` | string | No | Filter by status |
| `from_date` | string (ISO) | No | Start date |
| `to_date` | string (ISO) | No | End date |
| `sub_account_id` | string (UUID) | No | Filter by sub-account ID |

> **Sub-account view:** Pass `sub_account_id` from `GET /merchants/bank/sub-accounts` to see transfers for that specific account. Omit to see main account transfers.

---

### GET `/merchants/bank/transactions`

Get onramp/offramp/swap transaction history.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `type` | enum | No | `onramp` \| `offramp` \| `swap` |
| `status` | string | No | Filter by status |
| `sub_account_id` | string (UUID) | No | Filter by sub-account ID |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "reference": "REF-123",
      "amount": 50000,
      "tokenType": "CNGN",
      "status": "COMPLETED",
      "type": "onramp",
      "createdAt": "2026-06-25T10:00:00.000Z",
      "completedAt": "2026-06-25T10:05:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

Each item includes fields specific to its type:
- **onramp**: `amount`, `tokenAmount`, `tokenType`, `destinationAddress`, `network`
- **offramp**: `amount`, `fiatAmount`, `tokenType`, `bankCode`, `accountNumber`, `accountName`, `bankName`
- **swap**: `fromTokenType`, `fromAmount`, `toTokenType`, `toAmount`, `exchangeRate`, `transactionHash`

---

### GET `/merchants/bank/stats`

Get usage statistics for the last 30 days.

**Response:**
```json
{
  "period": "30d",
  "totalRequests": 150,
  "successCount": 140,
  "errorCount": 10,
  "transferCount": 25,
  "totalMoneyMoved": 500000,
  "recentRequests": [...],
  "recentTransfers": [...]
}
```

---

### GET `/merchants/bank/analytics`

Get time-series data for charts.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `period` | enum | No | `daily` \| `weekly` \| `monthly` (default: `daily`) |

- `daily` — last 30 days, grouped by day
- `weekly` — last 12 weeks, grouped by week (Monday start)
- `monthly` — last 12 months, grouped by month

**Response:**
```json
[
  {
    "date": "2026-05-27",
    "requestCount": 5,
    "successCount": 4,
    "errorCount": 1,
    "transferCount": 2,
    "moneyMoved": 50000
  }
]
```

---

### GET `/merchants/bank/webhook-logs`

Get webhook delivery history.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `event` | string | No | Filter by event type |
| `success` | boolean | No | Filter by success/failure |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "event": "onramp.completed",
      "url": "https://webhook.example.com",
      "statusCode": 200,
      "success": true,
      "errorMessage": null,
      "createdAt": "2026-06-25T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

---

### POST `/merchants/bank/transfer`

Initiate a bank transfer.

**Request:**
```json
{
  "beneficiaryBankCode": "090286",
  "beneficiaryAccountNumber": "0123456789",
  "amount": 5000,
  "narration": "Payment for services",
  "paymentReference": "ref-123456",
  "saveBeneficiary": false,
  "debitAccountNumber": "0123456789"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `beneficiaryBankCode` | string | Yes | Bank code of the recipient |
| `beneficiaryAccountNumber` | string | Yes | Account number of the recipient |
| `amount` | number | Yes | Amount in Naira (min: 1) |
| `narration` | string | Yes | Transfer description |
| `paymentReference` | string | Yes | Your unique reference |
| `saveBeneficiary` | boolean | No | Save beneficiary for future |
| `debitAccountNumber` | string | No | Sub-account to debit (defaults to main) |

---

### POST `/merchants/bank/name-enquiry`

Validate a bank account number.

**Request:**
```json
{
  "bankCode": "090286",
  "accountNumber": "0123456789"
}
```

---

### POST `/merchants/bank/sub-account`

Create a new sub-account.

**Pulse MFB example** (minimal — identity not needed):
```json
{
  "phoneNumber": "08012345678",
  "emailAddress": "user@example.com",
  "externalReference": "ref-123456"
}
```

**SafeHaven example** (identity required):
```json
{
  "phoneNumber": "08012345678",
  "emailAddress": "user@example.com",
  "externalReference": "ref-123456",
  "identityType": "BVN",
  "identityNumber": "22222222222"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phoneNumber` | string | Yes | Phone number |
| `emailAddress` | string | Yes | Email address |
| `externalReference` | string | Yes | Your unique reference |
| `identityType` | enum | SafeHaven only | `NIN` \| `vNIN` \| `BVN` \| `BVNUSSD` \| `vID` |
| `identityNumber` | string | SafeHaven only | Identity number (required for BVN/NIN) |
| `otp` | string | No | Required for `BVNUSSD` |
| `callbackUrl` | string | No | SafeHaven only — webhook URL |
| `autoSweep` | boolean | No | SafeHaven only — auto-sweep funds |

> **Pulse MFB:** Only `phoneNumber`, `emailAddress`, `externalReference` are used. All other fields are ignored.
> **SafeHaven:** `identityType` is required. Returns 400 if missing.

---

### POST `/merchants/bank/virtual-account`

Create a dynamic virtual account. **SafeHaven only.**

**Request:**
```json
{
  "amount": 5000,
  "validFor": 3600,
  "externalReference": "ref-123456",
  "amountControl": "OverPayment",
  "callbackUrl": "https://webhook.example.com/safehaven"
}
```

---

### POST `/merchants/bank/initiate-verification`

Initiate identity verification. **SafeHaven only.**

**Request:**
```json
{
  "type": "BVN",
  "number": "22222222222"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | enum | Yes | `BVN` \| `NIN` \| `vNIN` \| `BVNUSSD` \| `CAC` \| `CREDITCHECK` |
| `number` | string | Yes | Identity number |
| `otp` | string | No | Required for `BVNUSSD` |
| `verifierId` | string | No | Required for `vNIN` |

---

### POST `/merchants/bank/validate-verification`

Validate identity verification OTP. **SafeHaven only.**

**Request:**
```json
{
  "identityId": "id-123456",
  "type": "BVN",
  "otp": "123456"
}
```

---

## API Routes — `/merchants/api/*`

Auth: `x-api-key: <your_api_key>` (API key only — JWT tokens are rejected)

> Same endpoints as Dashboard routes but designed for server-to-server integrations. Use `snake_case` query params.

### GET `/merchants/api/account`

Get the merchant's main bank account balance and details.

**Response:** Same as Dashboard `/merchants/bank/account`.

---

### GET `/merchants/api/sub-accounts`

List all sub-accounts for this merchant.

**Response:** Same as Dashboard `/merchants/bank/sub-accounts`.

---

### GET `/merchants/api/sub-accounts/:id`

Get a single sub-account's balance and details.

**Response:** Same as Dashboard `/merchants/bank/sub-accounts/:id`.

---

### GET `/merchants/api/sub-accounts/:subAccountId/transfers`

Get transfer history for a specific sub-account.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `status` | string | No | Filter by status |
| `fromDate` | string (ISO) | No | Start date |
| `toDate` | string (ISO) | No | End date |

---

### GET `/merchants/api/sub-accounts/:subAccountId/transactions`

Get onramp/offramp/swap transaction history for a specific sub-account.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `type` | enum | No | `onramp` \| `offramp` \| `swap` |
| `status` | string | No | Filter by status |

**Response:** Same structure as `/merchants/api/transactions`.

---

### GET `/merchants/api/transfers`

Get bank transfer history.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `status` | string | No | Filter by status |
| `from_date` | string (ISO) | No | Start date |
| `to_date` | string (ISO) | No | End date |
| `sub_account_id` | string (UUID) | No | Filter by sub-account ID |

**Response:** Same as Dashboard `/merchants/bank/transfers`.

---

### GET `/merchants/api/transactions`

Get onramp/offramp/swap transaction history.

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (max: 100) |
| `type` | enum | No | `onramp` \| `offramp` \| `swap` |
| `status` | string | No | Filter by status |
| `sub_account_id` | string (UUID) | No | Filter by sub-account ID |

**Response:** Same as Dashboard `/merchants/bank/transactions`.

---

### GET `/merchants/api/banks`

Get list of supported banks. **SafeHaven only.**

**Response:** Same as Dashboard `/merchants/bank/banks`.

---

### POST `/merchants/api/name-enquiry`

Validate a bank account number.

**Request:**
```json
{
  "bank_code": "090286",
  "account_number": "0123456789"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bank_code` | string | Yes | Bank code |
| `account_number` | string | Yes | Account number |

---

### POST `/merchants/api/transfer`

Transfer funds from the merchant's account.

**Request:**
```json
{
  "beneficiary_bank_code": "090286",
  "beneficiary_account_number": "0123456789",
  "amount": 5000,
  "narration": "Payment for services",
  "payment_reference": "ref-123456",
  "save_beneficiary": false,
  "debit_account_number": "0123456789"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `beneficiary_bank_code` | string | Yes | Bank code of the recipient |
| `beneficiary_account_number` | string | Yes | Account number of the recipient |
| `amount` | number | Yes | Amount in Naira (min: 1) |
| `narration` | string | Yes | Transfer description |
| `payment_reference` | string | Yes | Your unique reference |
| `save_beneficiary` | boolean | No | Save beneficiary for future |
| `debit_account_number` | string | No | Sub-account to debit (defaults to main) |

---

### POST `/merchants/api/sub-account`

Create a new sub-account.

**Pulse MFB example** (minimal — identity not needed):
```json
{
  "phoneNumber": "08012345678",
  "emailAddress": "user@example.com",
  "externalReference": "ref-123456"
}
```

**SafeHaven example** (identity required):
```json
{
  "phoneNumber": "08012345678",
  "emailAddress": "user@example.com",
  "externalReference": "ref-123456",
  "identityType": "BVN",
  "identityNumber": "22222222222"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phoneNumber` | string | Yes | Phone number |
| `emailAddress` | string | Yes | Email address |
| `externalReference` | string | Yes | Your unique reference |
| `identityType` | enum | SafeHaven only | `NIN` \| `vNIN` \| `BVN` \| `BVNUSSD` \| `vID` |
| `identityNumber` | string | SafeHaven only | Identity number (required for BVN/NIN) |
| `otp` | string | No | Required for `BVNUSSD` |
| `callbackUrl` | string | No | SafeHaven only — webhook URL |
| `autoSweep` | boolean | No | SafeHaven only — auto-sweep funds |

> **Pulse MFB:** Only `phoneNumber`, `emailAddress`, `externalReference` are used. All other fields are ignored.
> **SafeHaven:** `identityType` is required. Returns 400 if missing.

---

### POST `/merchants/api/virtual-account`

Create a dynamic virtual account. **SafeHaven only.**

**Request:**
```json
{
  "amount": 5000,
  "valid_for": 3600,
  "external_reference": "ref-123456",
  "amount_control": "OverPayment",
  "callback_url": "https://webhook.example.com/safehaven"
}
```

---

### POST `/merchants/api/initiate-verification`

Initiate identity verification. **SafeHaven only.**

**Request:**
```json
{
  "type": "BVN",
  "number": "22222222222"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | enum | Yes | `BVN` \| `NIN` \| `vNIN` \| `BVNUSSD` \| `CAC` \| `CREDITCHECK` |
| `number` | string | Yes | Identity number |
| `otp` | string | No | Required for `BVNUSSD` |
| `verifier_id` | string | No | Required for `vNIN` |

---

### POST `/merchants/api/validate-verification`

Validate identity verification OTP. **SafeHaven only.**

**Request:**
```json
{
  "identity_id": "id-123456",
  "type": "BVN",
  "otp": "123456"
}
```

---

## Admin Routes — `/admin/*`

Auth: `Authorization: Bearer <admin_jwt_token>`

### GET `/admin/merchants/:id/bank-account`

Get a merchant's bank account and sub-accounts.

**Response:**
```json
{
  "merchantId": "uuid",
  "bankAccount": {
    "id": "uuid",
    "fiatProvider": "PULSE_MFB",
    "bankCode": "090713",
    "accountNumber": "0123456789",
    "accountName": "My Business",
    "bankName": "Pulse MFB",
    "metadata": { ... }
  },
  "subAccounts": [
    {
      "id": "uuid",
      "bankCode": "090713",
      "accountNumber": "9876543210",
      "accountName": "Sub Account 1",
      "bankName": "Pulse MFB"
    }
  ]
}
```

---

### GET `/admin/merchants/:id/sub-accounts`

Get a merchant's sub-accounts only.

**Response:** Array of sub-account objects.

---

### POST `/admin/merchants/:id/bank-account`

Create a bank account for a verified merchant.

**Pulse MFB example:**
```json
{
  "accountType": "Current",
  "suffix": "ACME",
  "provider": "PULSE_MFB"
}
```

**SafeHaven example:**
```json
{
  "accountType": "Savings",
  "suffix": "ACME",
  "provider": "SAFEHAVEN"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountType` | enum | Yes | `Savings` \| `Current` |
| `suffix` | string | Yes | Account suffix (e.g. company name) |
| `provider` | string | No | `SAFEHAVEN` \| `PULSE_MFB` (defaults to env `DEFAULT_FIAT_PROVIDER`) |

> After creating, the bank account's `fiatProvider` is set. All future sub-account creation and transfers use this provider.

---

## Provider Limitations

| Endpoint | SafeHaven | Pulse MFB |
|----------|-----------|-----------|
| Account info | Yes | Yes |
| Sub-accounts | Yes | Yes |
| Name enquiry | Yes | Yes |
| Transfer | Yes | Yes |
| Transfer history | Yes | Yes |
| Transactions | Yes | Yes |
| Stats/Analytics | Yes | Yes |
| Webhook logs | Yes | Yes |
| Virtual accounts | Yes | No |
| Identity verification | Yes | No |
| Bank list | Yes | No |

---

## Sub-Account Flow

### Dashboard (JWT)
1. **List sub-accounts:** `GET /merchants/bank/sub-accounts`
2. **Click a sub-account:** Navigate to its detail page
3. **View sub-account transfers:** `GET /merchants/bank/sub-accounts/:subAccountId/transfers`
4. **View sub-account transactions:** `GET /merchants/bank/sub-accounts/:subAccountId/transactions`
5. **View sub-account details:** `GET /merchants/bank/sub-accounts/:subAccountId`

### API (API Key)
1. **List sub-accounts:** `GET /merchants/api/sub-accounts`
2. **Get sub-account details:** `GET /merchants/api/sub-accounts/:subAccountId`
3. **View sub-account transfers:** `GET /merchants/api/sub-accounts/:subAccountId/transfers`
4. **View sub-account transactions:** `GET /merchants/api/sub-accounts/:subAccountId/transactions`

> Stats (`/merchants/bank/stats`) and analytics (`/merchants/bank/analytics`) are always **aggregate across all accounts**.

---

## Error Responses

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

Common errors:
- `400` — Validation failed, insufficient funds, provider limitation
- `401` — Missing/invalid auth
- `403` — Merchant not verified or suspended
- `404` — Resource not found
- `502` — Provider API error
