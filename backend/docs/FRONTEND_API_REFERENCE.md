# Frontend API Reference

All new/changed endpoints. Base URL: `https://api.autoramp.co` (production).

Auth: JWT Bearer token (`Authorization: Bearer <token>`) or API key (`x-api-key`).

---

## 1. Unified Transactions

### GET /merchants/:merchantId/transactions

Returns ALL transaction types merged and sorted by date (newest first).

**Auth:** JWT (merchant sees own, admin passes `?merchantId=xxx`)

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | all | Filter: `onramp`, `offramp`, `swap`, `bank_transfer` |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Page size |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "onramp",
      "amount": 5000,
      "status": "COMPLETED",
      "createdAt": "2026-01-15T12:00:00.000Z",
      "reference": "ref-1",
      "details": {
        "tokenType": "USDC",
        "network": "tron",
        "destinationAddress": "Txxx"
      }
    },
    {
      "id": "uuid",
      "type": "bank_transfer",
      "amount": 2000,
      "status": "PENDING",
      "createdAt": "2026-01-14T12:00:00.000Z",
      "reference": "bnk_1721000000000",
      "details": {
        "beneficiaryBankCode": "044",
        "beneficiaryAccountNumber": "1234567890",
        "narration": "Vendor payment"
      }
    }
  ],
  "meta": { "total": 25, "page": 1, "limit": 20, "totalPages": 2 }
}
```

**`details` by type:**

| Type | Fields |
|------|--------|
| `onramp` | `tokenType`, `network`, `destinationAddress` |
| `offramp` | `tokenType`, `bankCode`, `accountNumber`, `accountName` |
| `swap` | `fromTokenType`, `toTokenType`, `toAmount`, `exchangeRate` |
| `bank_transfer` | `beneficiaryBankCode`, `beneficiaryAccountNumber`, `narration` |

**Status values:** `PENDING`, `COMPLETED`, `FAILED`

---

### GET /merchants/:merchantId/transactions/summary

Aggregated counts and volumes.

**Response:**
```json
{
  "onramp":     { "count": 5, "volume": 10000 },
  "offramp":    { "count": 3, "volume": 8000 },
  "swap":       { "count": 2, "volume": 2000 },
  "bankTransfer": { "count": 10, "volume": 50000 }
}
```

Only counts COMPLETED transactions.

---

## 2. Bank Transfers

### POST /merchants/bank/transfer

Initiates a bank transfer. Returns immediately; status updates via webhook.

**Request:**
```json
{
  "beneficiaryBankCode": "044",
  "beneficiaryAccountNumber": "1234567890",
  "amount": 5000,
  "narration": "Vendor payment",
  "paymentReference": "optional-ref",
  "saveBeneficiary": false,
  "debitAccountNumber": "optional-sub-account"
}
```

**Response:** SafeHaven transfer response (status is initially `PENDING` on our side).

**Status lifecycle:**
1. `PENDING` — transfer initiated, awaiting SafeHaven confirmation
2. `COMPLETED` — SafeHaven `account.debit` webhook received with `responseCode: "00"`
3. `FAILED` — SafeHaven webhook with error code

---

## 3. Audit Logs

### GET /merchants/bank/audit-logs

Returns audit logs for the authenticated merchant.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `action` | string | all | Filter by action (e.g. `transfer`, `create_sub_account`) |
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Page size |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "merchantId": "uuid",
      "action": "transfer",
      "provider": "pulse_mfb",
      "endpoint": "/merchants/api/transfer",
      "method": "POST",
      "request": { "amount": 5000, "beneficiaryBankCode": "044" },
      "response": { "reference": "SHW-xxx", "status": "success" },
      "statusCode": 201,
      "duration": 1250,
      "success": true,
      "errorMessage": null,
      "createdAt": "2026-01-15T12:00:00.000Z"
    }
  ],
  "meta": { "total": 45, "page": 1, "limit": 50 }
}
```

---

### GET /admin/audit-logs

Admin-only. Returns all audit logs across all merchants.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `merchantId` | string | all | Filter by specific merchant |
| `action` | string | all | Filter by action type |
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Page size |

Same response shape as merchant audit logs.

---

## 4. Sub-Account Management

### PATCH /merchants/bank/sub-accounts/:id

Toggle auto-sweep on a sub-account.

**Request:**
```json
{
  "autoSweep": false,
  "autoSweepDetails": {
    "callbackUrl": "https://yoursite.com/webhook/sweep"
  }
}
```

**Response:** SafeHaven PUT response.

**Notes:**
- `autoSweep` is tracked in DB (default `true`)
- PATCH calls SafeHaven's PUT endpoint under the hood
- Identity fields (phone, email, etc.) are pulled from existing DB data automatically
- Pulse MFB sub-accounts do not support this

### PATCH /merchants/api/sub-accounts/:id

Same as above but for API key auth.

---

## 5. Bank Account (Balance)

### GET /merchants/api/account

Returns the merchant's main bank account with live balance from SafeHaven.

**Response:**
```json
{
  "id": "uuid",
  "accountNumber": "0117964837",
  "accountName": "My Business",
  "bankCode": "090267",
  "bankName": "Safe Haven MFB",
  "balance": 150000,
  "bookBalance": 149800,
  "status": "active"
}
```

**Balance caching:**
- Cached in DB for 5 minutes
- Zero balances are never cached (always live)

---

## 6. Webhook Events (SafeHaven → Us → You)

These are events we receive from SafeHaven and forward to your registered webhook URLs.

### account.credit

Money received into your account from an external party.

```json
{
  "event": "account.credit",
  "data": {
    "amount": 50000,
    "paymentReference": "SHW-xxx",
    "creditAccountNumber": "0117964837",
    "creditAccountName": "My Business",
    "debitAccountNumber": "0114012524",
    "debitAccountName": "Sender Name",
    "narration": "Payment for order #123",
    "status": "Completed"
  },
  "timestamp": "2026-01-15T12:00:00.000Z"
}
```

### account.debit

Money leaving your account (fees, charges, reversals, or outgoing transfers).

```json
{
  "event": "account.debit",
  "data": {
    "amount": 1500,
    "paymentReference": "SHW-xxx",
    "debitAccountNumber": "0117964837",
    "debitAccountName": "My Business",
    "creditAccountNumber": "0114012524",
    "creditAccountName": "Recipient",
    "narration": "Transfer fee",
    "type": "Outwards",
    "status": "Completed",
    "isReversed": false
  },
  "timestamp": "2026-01-15T12:00:00.000Z"
}
```

### bank_transfer.completed

Outgoing transfer confirmed or failed.

```json
{
  "event": "bank_transfer.completed",
  "data": {
    "id": "uuid",
    "reference": "bnk_1721000000000",
    "amount": 5000,
    "status": "COMPLETED",
    "beneficiaryBankCode": "044",
    "beneficiaryAccountNumber": "1234567890",
    "completedAt": "2026-01-15T12:01:00.000Z"
  },
  "timestamp": "2026-01-15T12:01:00.000Z"
}
```

### onramp.updated / offramp.updated

Transaction status changed (from SafeHaven webhook).

```json
{
  "event": "onramp.updated",
  "data": {
    "id": "uuid",
    "status": "PROCESSING",
    "amount": 10000,
    "reference": "ref-xxx"
  },
  "timestamp": "2026-01-15T12:00:00.000Z"
}
```

### account.created

Virtual account created for a merchant.

```json
{
  "event": "account.created",
  "data": { ... }
}
```

---

## 7. Admin Endpoints (Admin Only)

All admin endpoints require `role: "ADMIN"` in JWT.

### Admin Bank Routes (via merchant routes)

Admins use the **same merchant routes** with `?merchantId=xxx`:

| Action | Route |
|--------|-------|
| List sub-accounts | `GET /merchants/bank/sub-accounts?merchantId=xxx` |
| Get sub-account | `GET /merchants/bank/sub-accounts/:id?merchantId=xxx` |
| Toggle auto-sweep | `PATCH /merchants/bank/sub-accounts/:id?merchantId=xxx` |
| List transactions | `GET /merchants/:merchantId/transactions` |
| Transaction summary | `GET /merchants/:merchantId/transactions/summary` |
| Audit logs | `GET /admin/audit-logs?merchantId=xxx` |

---

## Quick Reference: Auth

| Route | Auth Method |
|-------|------------|
| `/merchants/bank/*` | JWT Bearer + `?merchantId` for admin |
| `/merchants/api/*` | API Key header (`x-api-key`) |
| `/merchants/:id/transactions/*` | JWT Bearer (merchant own, admin any) |
| `/admin/*` | JWT Bearer (admin only) |
