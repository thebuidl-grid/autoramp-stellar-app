# Transaction API

## Endpoints

### All Transactions (Unified)

```
GET /merchants/:merchantId/transactions
```

Returns all transaction types (onramp, offramp, swap, bank_transfer) merged and sorted by date (newest first).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | No | Filter by: `onramp`, `offramp`, `swap`, `bank_transfer` |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Page size (default: 20) |

**Response:**
```json
{
  "data": [
    {
      "id": "tx-1",
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
      "id": "tx-2",
      "type": "offramp",
      "amount": 3000,
      "status": "COMPLETED",
      "createdAt": "2026-01-14T12:00:00.000Z",
      "reference": "ref-2",
      "details": {
        "tokenType": "USDT",
        "bankCode": "044",
        "accountNumber": "1234567890",
        "accountName": "John Doe"
      }
    },
    {
      "id": "tx-3",
      "type": "swap",
      "amount": 100,
      "status": "COMPLETED",
      "createdAt": "2026-01-13T12:00:00.000Z",
      "reference": "ref-3",
      "details": {
        "fromTokenType": "USDC",
        "toTokenType": "USDT",
        "toAmount": 105,
        "exchangeRate": 1.05
      }
    },
    {
      "id": "tx-4",
      "type": "bank_transfer",
      "amount": 2000,
      "status": "COMPLETED",
      "createdAt": "2026-01-12T12:00:00.000Z",
      "reference": "bank-ref-4",
      "details": {
        "beneficiaryBankCode": "044",
        "beneficiaryAccountNumber": "1234567890",
        "narration": "Transfer to John"
      }
    }
  ],
  "meta": {
    "total": 4,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

**`details` varies by type:**

| Type | details fields |
|------|----------------|
| `onramp` | `tokenType`, `network`, `destinationAddress` |
| `offramp` | `tokenType`, `bankCode`, `accountNumber`, `accountName` |
| `swap` | `fromTokenType`, `toTokenType`, `toAmount`, `exchangeRate` |
| `bank_transfer` | `beneficiaryBankCode`, `beneficiaryAccountNumber`, `narration` |

---

### Transaction Summary

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

| Field | Description |
|-------|-------------|
| `onramp.count` | Number of completed onramp transactions |
| `onramp.volume` | Total crypto received (NGN value) |
| `offramp.count` | Number of completed offramp transactions |
| `offramp.volume` | Total fiat sent out (NGN) |
| `swap.count` | Number of completed swap transactions |
| `swap.volume` | Total swapped from amount |
| `bankTransfer.count` | Number of successful bank transfers |
| `bankTransfer.volume` | Total transferred (NGN) |

---

## Auth

| Role | Access |
|------|--------|
| Merchant | Own data only (resolved from JWT) |
| Admin | Any merchant (pass `?merchantId=xxx` query param) |

**Admin examples:**
```
GET /merchants/merchant-id/transactions?type=onramp&limit=50
GET /merchants/merchant-id/transactions/summary
```

---

## Notes

- All transactions are sorted by `createdAt` descending (newest first)
- Bank transfers are aggregated from successful API request logs (`/merchants/bank/transfer`, HTTP 2xx)
- Zero values return `0` for both count and volume
- `type` filter is optional — omit to get all types
