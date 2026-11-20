# Sub-Account Management API

## Endpoints

### List Sub-Accounts

```
GET /merchants/api/sub-accounts
GET /merchants/bank/sub-accounts
```

**Response:**
```json
[
  {
    "id": "uuid",
    "bankCode": "090286",
    "accountNumber": "1234567890",
    "accountName": "John Doe",
    "bankName": "Safe Haven MFB",
    "autoSweep": true,
    "metadata": { ... },
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

### Get Single Sub-Account (with live balance)

```
GET /merchants/api/sub-accounts/:id
GET /merchants/bank/sub-accounts/:id
```

Balance is fetched live from SafeHaven and cached in DB for 5 minutes.

**Response:**
```json
{
  "id": "uuid",
  "safehavenId": "...",
  "bankCode": "090286",
  "accountNumber": "1234567890",
  "accountBalance": 50000,
  "bookBalance": 49800,
  "status": "active"
}
```

### Create Sub-Account

```
POST /merchants/api/sub-account
POST /merchants/bank/sub-account
```

**Request:**
```json
{
  "phoneNumber": "08012345678",
  "emailAddress": "user@example.com",
  "externalReference": "ref-123",
  "identityType": "BVN",
  "identityNumber": "22222222222",
  "autoSweep": true
}
```

- `autoSweep` defaults to `true` if not provided
- `identityType` is required for SafeHaven, ignored for Pulse MFB

### Update Sub-Account (Auto-Sweep Toggle)

```
PATCH /merchants/api/sub-accounts/:id
PATCH /merchants/bank/sub-accounts/:id
```

Only auto-sweep settings can be changed. All other fields are pulled from existing DB data.

**Request:**
```json
{
  "autoSweep": false,
  "autoSweepDetails": {
    "callbackUrl": "https://yoursite.com/webhook/sweep"
  },
  "callbackUrl": "https://yoursite.com/callback"
}
```

**Response:** SafeHaven update response (raw)

**Notes:**
- `autoSweep` is tracked in the `merchant_sub_accounts.auto_sweep` column (default `true`)
- The PATCH route toggles both the DB column and calls SafeHaven's PUT endpoint
- Identity fields (phoneNumber, emailAddress, etc.) are read from the existing DB metadata and passed through to SafeHaven automatically
- Pulse MFB sub-accounts do not support updates

---

## Admin Access

Admins use the **same routes** as merchants. Pass `?merchantId=xxx` query param to act on behalf of a merchant.

| Route | Example |
|-------|---------|
| List | `GET /merchants/bank/sub-accounts?merchantId=xxx` |
| Get one | `GET /merchants/bank/sub-accounts/:id?merchantId=xxx` |
| Toggle sweep | `PATCH /merchants/bank/sub-accounts/:id?merchantId=xxx` |

Admin JWT token must have `role: "ADMIN"`. Without `merchantId`, the route resolves the merchant from the JWT user (works for merchants).

---

## Balance Caching

Both `GET /merchants/api/sub-accounts/:id` and `GET /merchants/api/account` use DB-based caching:

- Balance is stored in the `metadata` JSON field under `balance` and `balanceFetchedAt`
- Cache TTL is **5 minutes**
- Zero balances are **never cached** (always fetched live)
- After TTL expires, next request fetches fresh from SafeHaven

---

## Auth

| Route | Auth |
|-------|------|
| `/merchants/api/*` | API Key (`x-api-key` header) |
| `/merchants/bank/*` | JWT (`Authorization: Bearer <token>`) + `?merchantId` for admins |

---

## Transaction Summary

```
GET /merchants/:merchantId/transactions/summary
```

Returns aggregated counts and volumes for all transaction types including bank transfers.

**Response:**
```json
{
  "onramp": {
    "count": 5,
    "volume": 10000
  },
  "offramp": {
    "count": 3,
    "volume": 8000
  },
  "swap": {
    "count": 2,
    "volume": 2000
  },
  "bankTransfer": {
    "count": 10,
    "volume": 50000
  }
}
```

- Bank transfers are aggregated from successful API request logs (`/merchants/bank/transfer`)
- Admins can access any merchant's summary: `GET /merchants/:merchantId/transactions/summary` (admin JWT required)

---

## All Transactions (Unified)

```
GET /merchants/:merchantId/transactions
```

Returns all transaction types merged and sorted by date. See `transaction-summary-api.md` for full details.
