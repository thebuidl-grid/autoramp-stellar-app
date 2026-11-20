# Webhook Delivery Logs & Retry

## Overview

Every time a webhook is sent to your endpoint, a delivery log is created. You can view this history and manually retry any failed deliveries.

## Base URL

`https://api.autoramp.com`

## Authentication

Requires a JWT Bearer token (merchant dashboard auth).

| Method | Header |
|--------|--------|
| `Authorization: Bearer <token>` | JWT |

---

## 1. View Delivery Logs

Fetch paginated webhook delivery history.

### Request

```
GET /merchants/webhook-logs
```

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Results per page (max 100) |
| `event` | string | - | Filter by event type (e.g. `onramp.completed`, `vas.updated`) |
| `success` | boolean | - | Filter by delivery success (true/false) |

### Response

```json
{
  "data": [
    {
      "id": "clj...",
      "event": "onramp.completed",
      "url": "https://yourapp.com/webhooks/autoramp",
      "statusCode": 200,
      "success": true,
      "errorMessage": null,
      "createdAt": "2026-07-22T10:05:00.000Z"
    },
    {
      "id": "clk...",
      "event": "vas.updated",
      "url": "https://yourapp.com/webhooks/autoramp",
      "statusCode": 500,
      "success": false,
      "errorMessage": "Request failed with status code 500",
      "createdAt": "2026-07-22T10:01:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Log entry ID (used for retry) |
| `event` | string | Webhook event type |
| `url` | string | Endpoint URL that was called |
| `statusCode` | int or null | HTTP response status code |
| `success` | boolean | Whether delivery was successful (2xx) |
| `errorMessage` | string or null | Error message on failure |
| `createdAt` | datetime | When the delivery was attempted |

---

## 2. Retry a Failed Delivery

Manually re-send a failed webhook to your endpoint.

### Request

```
POST /merchants/webhook-logs/{id}/retry
```

| Parameter | Type | Location | Description |
|-----------|------|----------|-------------|
| `id` | string | path | The webhook log ID from the delivery logs |

No request body needed.

### Response (success)

```json
{
  "success": true,
  "statusCode": 200
}
```

### Response (still failing)

Returns the same error the original delivery got (status code, error message). The log is updated with the new attempt.

---

## 3. Webhook Events

| Event | Description |
|-------|-------------|
| `account.created` | A bank account or sub-account was created |
| `onramp.initialized` | Onramp transaction created, waiting for payment |
| `onramp.updated` | Onramp status changed |
| `onramp.completed` | Payment received and crypto sent |
| `onramp.failed` | Onramp failed |
| `offramp.initialized` | Offramp transaction created |
| `offramp.updated` | Offramp status changed |
| `offramp.completed` | Crypto received and fiat sent to bank |
| `offramp.failed` | Offramp failed |
| `swap.initialized` | Swap transaction created |
| `swap.updated` | Swap status changed |
| `swap.completed` | Swap executed successfully |
| `swap.failed` | Swap failed |
| `transfer.completed` | Bank transfer completed |
| `transfer.failed` | Bank transfer failed |
| `vas.updated` | VAS transaction status changed |
| `vas.completed` | VAS transaction completed |
| `vas.failed` | VAS transaction failed |

### Payload Format

All webhooks follow this structure:

```json
{
  "event": "onramp.completed",
  "data": {
    "id": "uuid",
    "reference": "REF-123456",
    "amount": 50000,
    "status": "COMPLETED",
    "createdAt": "2026-06-28T10:00:00.000Z",
    "completedAt": "2026-06-28T10:05:00.000Z"
  },
  "timestamp": "2026-06-28T10:05:00.000Z"
}
```

### Headers

Every webhook request includes:

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | HMAC-SHA256 hex digest of the raw body |
| `X-Webhook-Event` | The event type string |

---

## 4. Automatic Retries

Failed webhooks are automatically retried on a schedule:

| Attempt | Delay |
|---------|-------|
| 1st retry | 5 seconds |
| 2nd retry | 30 seconds |
| 3rd retry | 2 minutes |

After 3 failed attempts, no more automatic retries. The merchant can still manually retry via the endpoint above.

### Frontend Implementation Notes

- **Show a "Retry" button** on failed delivery log entries
- **Call `POST /merchants/webhook-logs/{id}/retry`** when clicked
- **Refresh the logs** after retry to show the updated status
- **Disable retry** for logs that are already successful
- **Poll or refresh** the logs on the webhook settings page so merchants can see delivery status in real time
