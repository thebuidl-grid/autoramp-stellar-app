# Admin API Docs — Frontend

Base URL: `/admin`
Auth: `Authorization: Bearer <JWT>` (admin only)

---

## Dashboard Summary

### `GET /transactions/summary`

Full transaction summary with fee breakdown.

**Query:** `?period=today|7d|30d|90d|all` (default: `all`)

```json
{
  "period": "30d",
  "totalVolume": 79061514.55,
  "totalCount": 747,
  "successRate": 39,

  "onramp": {
    "count": 63,
    "totalAmount": 20697750,
    "totalFees": 0
  },
  "offramp": {
    "count": 60,
    "totalAmount": 17862657.56,
    "totalFees": 0
  },
  "swap": {
    "count": 132,
    "totalFromAmount": 11080421.28,
    "totalToAmount": 11080421.28,
    "totalFees": 0
  },
  "bankTransfer": {
    "count": 44,
    "totalAmount": 2378.32,
    "totalFees": 0
  },
  "vas": {
    "count": 0,
    "totalAmount": 0,
    "totalFees": 0
  },
  "otc": {
    "count": 2,
    "totalAmount": 21510000,
    "totalFees": 0
  },
  "fees": {
    "provider_fee": 0,
    "vat": 0,
    "stamp_duty": 0,
    "platform_fee": 0,
    "total": 0
  },
  "netVolume": 2835092.44
}
```

---

### `GET /transactions/analytics`

Time-series buckets for charts.

**Query:** `?period=daily|weekly|monthly` (default: `daily`)

```json
[
  {
    "date": "2026-07-21",
    "onrampVolume": 1000000,
    "onrampCount": 5,
    "offrampVolume": 500000,
    "offrampCount": 3,
    "swapVolume": 200000,
    "swapCount": 2,
    "bankTransferVolume": 300000,
    "bankTransferCount": 4,
    "vasVolume": 100000,
    "vasCount": 10,
    "otcVolume": 5000000,
    "otcCount": 1,
    "totalVolume": 7100000,
    "totalCount": 25,
    "totalFees": 5750
  }
]
```

---

## Transaction Drill-Down

### `GET /platform-transactions`

Click any tile → fetch the list.

**Query:**
| Param | Type | Options |
|---|---|---|
| `type` | string | `onramp`, `offramp`, `swap`, `merchant_onramp`, `merchant_offramp`, `merchant_swap`, `bank_transfer`, `otc`, `vas` |
| `page` | number | default 1 |
| `limit` | number | default 10 |
| `status` | string | `PENDING`, `COMPLETED`, `FAILED`, etc. |
| `search` | string | Search by reference |

**Response (all types same shape):**
```json
{
  "data": [
    {
      "id": "uuid",
      "reference": "onr_abc123",
      "amount": 100000,
      "status": "COMPLETED",
      "createdAt": "2026-07-27T10:30:00.000Z",
      "_type": "onramp"
    }
  ],
  "pagination": {
    "total": 747,
    "page": 1,
    "limit": 10,
    "totalPages": 75
  }
}
```

**Fields by type:**

| `_type` | Extra fields |
|---|---|
| `onramp` | `userEmail` |
| `offramp` | `fiatAmount`, `userEmail` |
| `swap` | `fromAmount`, `toAmount`, `fromTokenType`, `toTokenType`, `userEmail` |
| `merchant_onramp` | — |
| `merchant_offramp` | `fiatAmount`, `accountNumber`, `accountName`, `bankName` |
| `merchant_swap` | `fromAmount`, `toAmount`, `fromTokenType`, `toTokenType` |
| `bank_transfer` | `beneficiaryAccountNumber`, `beneficiaryAccountName`, `beneficiaryBankCode`, `narration` |
| `otc` | `userEmail` |
| `vas` | `serviceType` |

---

## Tile → Type mapping

| Dashboard Tile | `type` param |
|---|---|
| Onramp | `onramp` + `merchant_onramp` (or all without filter) |
| Offramp | `offramp` + `merchant_offramp` |
| Swap | `swap` + `merchant_swap` |
| Bank Transfer | `bank_transfer` |
| OTC | `otc` |
| VAS | `vas` |
| Total Volume / All | no `type` param |

---

## Other Admin Endpoints

### `GET /users?page=&limit=&search=&status=`
### `GET /users/:userId`
### `PATCH /users/:userId/flags`
### `POST /approve-access`
### `GET /merchants/:id/sub-accounts`
### `GET /merchants/:id/sub-accounts/:subAccountId/transactions?page=&limit=&status=&fromDate=&toDate=`
### `GET /transfer-logs?page=&limit=&status=&startDate=&endDate=`
### `GET /transfer-logs/:transactionId`
### `GET /audit-logs?merchantId=&action=&page=&limit=`
