# Ramp API Examples

This document provides example requests and responses for the Ramp onramp and offramp endpoints.

## Onramp

**Endpoint:** `POST /ramp/onramp`

### Request Example

```json
{
  "network": "base",
  "amount": 5000,
  "destination": {
    "address": "0x1234567890abcdef1234567890abcdef12345678"
  }
}
```

### Response Example

```json
{
  "status": "success",
  "message": "Transaction initialised successfully",
  "data": {
    "transactionId": "trx_8147ea6b4fc5a5bf57b222eca3fa",
    "reference": "TRX-1707945600000-ABCD",
    "depositAccount": {
      "accountName": "AUTORAMP/JOHN DOE",
      "accountNumber": "1234567890",
      "bankName": "SafeHaven MFB",
      "bankCode": "999999"
    }
  },
  "databaseRecord": {
    "id": "cm7...abc",
    "reference": "TRX-1707945600000-ABCD",
    "status": "PENDING",
    "createdAt": "2026-02-14T21:25:43.000Z"
  }
}
```

---

## Offramp

**Endpoint:** `POST /ramp/offramp`

### Request Example

```json
{
  "network": "base",
  "amount": 2000,
  "destination": {
    "bankCode": "044",
    "accountNumber": "0123456789"
  }
}
```

### Response Example

```json
{
  "status": "success",
  "message": "Transaction initialised successfully",
  "data": {
    "transactionId": "trx_9258fb7c5gd6b6cg68c333fdb4fb",
    "reference": "TRX-1707945700000-EFGH",
    "depositAccount": {}
  },
  "databaseRecord": {
    "id": "cm7...def",
    "reference": "TRX-1707945700000-EFGH",
    "status": "PENDING",
    "createdAt": "2026-02-14T21:26:43.000Z"
  }
}
```

## Field Descriptions

| Field                       | Type     | Description                                           |
| :-------------------------- | :------- | :---------------------------------------------------- |
| `network`                   | `string` | The blockchain network (e.g., `base`, `bsc`).         |
| `amount`                    | `number` | The amount in NGN (minimum 100).                      |
| `destination`               | `object` | Target destination for the ramp.                      |
| `destination.address`       | `string` | (Onramp) The crypto wallet address to receive tokens. |
| `destination.bankCode`      | `string` | (Offramp) The bank code of the recipient account.     |
| `destination.accountNumber` | `string` | (Offramp) The account number of the recipient.        |
| `databaseRecord`            | `object` | Internal tracking information for the transaction.    |
