# OTC API Routes

All routes require `Authorization: Bearer <JWT>` header.
All `network` fields accept `"base"` or `"bsc"` (backward compatible, defaults to `"base"`).

---

## OTC Onramp

### `POST /otc/transaction` — Initiate OTC Onramp

**Payload:**
```json
{
  "quantity": 100,
  "token": "USDC",
  "network": "bsc",
  "chain": "bsc",
  "address": "0x...",
  "memo": ""
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| quantity | number | yes | Min 1 (USD) |
| token | string | yes | e.g. "USDC" |
| network | string | yes | `"base"` or `"bsc"` |
| chain | string | no | |
| address | string | yes | Destination wallet |
| memo | string | no | |

**Response:**
```json
{
  "type": "onramp",
  "quote": {
    "rate": 1380.965,
    "flatFee": 0.5,
    "sourceAmount": 100,
    "destinationAmount": 138096.5
  },
  "issuance": {
    "bankCode": "090286",
    "accountNumber": "1234567890",
    "accountName": "John Doe",
    "bankName": "MFB MFB"
  },
  "destination": {
    "address": "0x..."
  }
}
```

---

### `POST /otc/onramp/quote` — Get OTC Onramp Quote

**Payload:**
```json
{
  "amount": 100,
  "network": "bsc"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| amount | number | yes | |
| network | string | no | `"base"` or `"bsc"`, defaults to `"base"` |

**Response:**
```json
{
  "rate": 1600.50
}
```

---

### `POST /otc/onramp/execute` — Execute OTC Onramp

**Payload:**
```json
{
  "amount": 100,
  "reference": "uuid",
  "network": "bsc",
  "notifyUrl": "https://...",
  "destination": {
    "address": "0x..."
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| amount | number | yes | |
| reference | string | yes | Transaction reference |
| network | string | no | `"base"` or `"bsc"`, defaults to `"base"` |
| notifyUrl | string | no | Webhook URL |
| destination.address | string | yes | Wallet to receive crypto |

**Response:**
```json
{
  "type": "onramp",
  "id": "txn-id-from-flint",
  "address": "0xae460A51A47D625D042415BD3b7D75F9B8BAFBe8",
  "quote": {
    "rate": 1380.965,
    "expiry": "2026-07-10T19:52:27+01:00",
    "source": {
      "amount": 100,
      "network": "BSC",
      "currency": "USDC"
    },
    "destination": {
      "amount": 138096.5,
      "network": "FIAT",
      "currency": "NGN"
    }
  },
  "deposit": {
    "asset": "base:usdc",
    "amount": 100,
    "address": "0xae460A51A47D625D042415BD3b7D75F9B8BAFBe8"
  },
  "destination": {
    "address": "0x..."
  }
}
```

---

### `GET /otc/rate` — Get OTC Rate

**Query params:**
```
?token=USDC&network=bsc
```

| Param | Type | Required | Notes |
|---|---|---|---|
| token | string | no | Defaults to "USDC" |
| network | string | no | `"base"` or `"bsc"`, defaults to `"base"` |

**Response:**
```json
{
  "rate": 1600.50
}
```

---

## OTC Offramp

### `POST /otc/offramp/transaction` — Initiate OTC Offramp

**Payload:**
```json
{
  "quantity": 100,
  "token": "USDC",
  "network": "bsc",
  "chain": "bsc",
  "address": "0x...",
  "memo": "",
  "bankCode": "090133",
  "accountNumber": "1234567890"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| quantity | number | yes | Min 1 (USD) — crypto amount to sell |
| token | string | yes | e.g. "USDC" |
| network | string | yes | `"base"` or `"bsc"` |
| chain | string | no | |
| address | string | yes | Source wallet address |
| memo | string | no | |
| bankCode | string | yes | Bank to receive NGN |
| accountNumber | string | yes | Account to receive NGN |

**Response:**
```json
{
  "type": "offramp",
  "quote": {
    "rate": 1380.965,
    "flatFee": 0.5,
    "sourceAmount": 2251.038991,
    "destinationAmount": 3108606.06
  },
  "depositAddress": {
    "address": "0xae460A51A47D625D042415BD3b7D75F9B8BAFBe8",
    "network": "BSC",
    "token": "USDC",
    "memo": null
  },
  "destination": {
    "bankCode": "000015",
    "accountNumber": "2270121368"
  }
}
```

---

### `POST /otc/offramp/quote` — Get OTC Offramp Quote

**Payload:**
```json
{
  "amount": 100,
  "network": "bsc"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| amount | number | yes | |
| network | string | no | `"base"` or `"bsc"`, defaults to `"base"` |

**Response:**
```json
{
  "rate": 1600.50
}
```

---

### `POST /otc/offramp/execute` — Execute OTC Offramp

**Payload:**
```json
{
  "amount": 100,
  "reference": "uuid",
  "network": "bsc",
  "notifyUrl": "https://...",
  "destination": {
    "bankCode": "090133",
    "accountNumber": "1234567890"
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| amount | number | yes | |
| reference | string | yes | Transaction reference |
| network | string | no | `"base"` or `"bsc"`, defaults to `"base"` |
| notifyUrl | string | no | Webhook URL |
| destination.bankCode | string | yes | Bank to receive NGN |
| destination.accountNumber | string | yes | Account to receive NGN |

**Response:**
```json
{
  "type": "offramp",
  "id": "txn-id-from-flint",
  "address": "0xae460A51A47D625D042415BD3b7D75F9B8BAFBe8",
  "quote": {
    "rate": 1380.965,
    "expiry": "2026-07-10T19:52:27+01:00",
    "source": {
      "amount": 2251.038991,
      "network": "BSC",
      "currency": "USDC"
    },
    "destination": {
      "amount": 3108606.06,
      "network": "FIAT",
      "currency": "NGN"
    }
  },
  "deposit": {
    "asset": "base:usdc",
    "amount": 2251.038948,
    "address": "0xae460A51A47D625D042415BD3b7D75F9B8BAFBe8"
  },
  "destination": {
    "bankCode": "000015",
    "accountNumber": "2270121368"
  }
}
```

---

## Existing Endpoints

### `GET /otc/status/:reference` — Get Transaction Status

**Response:**
```json
{
  "id": "uuid",
  "reference": "uuid",
  "amount": 3108606.06,
  "quantity": 2251.038991,
  "rate": 1380.965,
  "status": "PENDING",
  "issuance": null
}
```

Note: `meta` field is stripped — raw provider responses are not returned.

---

### `GET /otc/transactions` — List All OTC Transactions

Returns both onramp and offramp. `meta` field is stripped.

---

### `GET /otc/isEnabled` — Check OTC Enablement

No changes.

---

### `POST /otc/onboard` — Onboard for OTC

No changes.
