# Webhook API Changes — Frontend Migration Guide

> **Date:** 2026-07-13  
> **Breaking:** Yes — old single-webhook endpoints removed

---

## What Changed

The webhook system was upgraded from **1 webhook per merchant** to **multiple webhooks per merchant**. Each webhook has its own URL, signing secret, and can be toggled on/off independently.

### Removed Fields on Merchant Object

| Field | Status |
|-------|--------|
| `merchant.webhookUrl` | **DELETED** |
| `merchant.webhookSecret` | **DELETED** |

These no longer exist. All webhook data is managed via the new endpoints below.

---

## New API Endpoints

**Base URL:** `https://api.autoramp.com/merchants/:merchantId/settings`  
**Auth:** `Authorization: Bearer <token>` (JWT)

### 1. List All Webhooks

```http
GET /webhooks
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://yourapp.com/webhooks/autoramp",
    "secret": "whsec_a1b2c3d4...",
    "active": true,
    "label": "Production",
    "createdAt": "2026-07-13T10:00:00.000Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "url": "https://staging.yourapp.com/webhooks/autoramp",
    "secret": "whsec_x9y8z7w6...",
    "active": false,
    "label": "Staging",
    "createdAt": "2026-07-10T08:00:00.000Z"
  }
]
```

### 2. Add a Webhook

```http
POST /webhooks
Content-Type: application/json
```

**Request:**
```json
{
  "url": "https://yourapp.com/webhooks/autoramp",
  "label": "Production"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | **Yes** | HTTPS URL to receive webhooks |
| `label` | string | No | Friendly name (e.g. "Production", "Staging") |

**Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://yourapp.com/webhooks/autoramp",
  "secret": "whsec_a1b2c3d4...",
  "active": true,
  "label": "Production",
  "createdAt": "2026-07-13T10:00:00.000Z"
}
```

> ⚠️ **Show the `secret` to the user ONCE at creation.** It cannot be retrieved later — only rotated.

### 3. Update a Webhook

```http
PATCH /webhooks/:webhookId
Content-Type: application/json
```

**Request (all fields optional):**
```json
{
  "url": "https://new-url.com/webhooks",
  "label": "Updated Label",
  "active": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | New webhook URL |
| `label` | string | New label |
| `active` | boolean | `true` = enabled, `false` = disabled |

**Response:** Updated webhook object (same shape as above)

### 4. Delete a Webhook

```http
DELETE /webhooks/:webhookId
```

**Response:**
```json
{ "deleted": true }
```

### 5. Rotate Signing Secret

```http
POST /webhooks/:webhookId/rotate-secret
```

**Response:**
```json
{
  "webhookId": "550e8400-e29b-41d4-a716-446655440000",
  "secret": "whsec_new_secret_here..."
}
```

> ⚠️ **Show the new secret to the user.** The old secret is immediately invalidated.

---

## Old Endpoints (REMOVED)

Do **not** use these — they no longer exist:

| Old Endpoint | Replacement |
|--------------|-------------|
| `GET /settings/webhook` | `GET /settings/webhooks` |
| `PATCH /settings/webhook` | `POST /settings/webhooks` (add) or `PATCH /settings/webhooks/:id` (update) |
| `POST /settings/webhook/rotate-secret` | `POST /settings/webhooks/:id/rotate-secret` |

---

## Frontend Implementation Notes

### Settings Page Layout

The webhook settings page should show a **list of webhooks**, not a single URL field. Each row should display:

```
[✓] https://yourapp.com/webhooks/autoramp  [Production]  [Edit] [Rotate Secret] [Delete]
[ ] https://staging.yourapp.com/webhooks   [Staging]     [Edit] [Rotate Secret] [Delete]
```

- **Toggle** — PATCH with `{ active: true/false }`
- **Edit** — PATCH with `{ url: "...", label: "..." }`
- **Rotate Secret** — POST to `/rotate-secret`, then show the new secret in a modal (one-time display)
- **Delete** — DELETE, with confirmation dialog

### State Management

After any mutation (add/update/delete/rotate), refetch the list with `GET /webhooks`.

### Error Handling

| Status | Meaning |
|--------|---------|
| `400` | Invalid URL or duplicate URL |
| `401` | Not authenticated |
| `403` | Not merchant owner |
| `404` | Webhook not found |
| `409` | Duplicate URL (same URL already exists for this merchant) |

### Secret Display

When a webhook is created or a secret is rotated, the `secret` field is returned **only in that response**. Design the UI to:

1. Show the secret in a copyable field immediately after creation/rotation
2. Display a warning: "Save this secret now. It won't be shown again."
3. Offer a "Copy to clipboard" button

---

## Webhook Events (for reference)

Merchants receive these events on all active webhook URLs:

| Event | Description |
|-------|-------------|
| `account.created` | Bank account or sub-account created |
| `onramp.initialized` | Onramp started |
| `onramp.updated` | Onramp status changed |
| `onramp.completed` | Onramp finished |
| `onramp.failed` | Onramp failed |
| `offramp.initialized` | Offramp started |
| `offramp.updated` | Offramp status changed |
| `offramp.completed` | Offramp finished |
| `offramp.failed` | Offramp failed |
| `swap.initialized` | Swap started |
| `swap.updated` | Swap status changed |
| `swap.completed` | Swap finished |
| `swap.failed` | Swap failed |

---

## Payload Shape

```json
{
  "event": "onramp.completed",
  "data": { ... },
  "timestamp": "2026-07-13T10:00:00.000Z"
}
```

## Headers on Incoming Webhooks

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | HMAC-SHA256 of raw body |
| `X-Webhook-Event` | Event type string |

---

## Full Example: Add + Verify Flow

```javascript
// 1. Add a webhook
const res = await fetch('/merchants/:merchantId/settings/webhooks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://myapp.com/webhooks/autoramp',
    label: 'Production',
  }),
});

const webhook = await res.json();
// webhook.secret = "whsec_..." → SHOW THIS TO USER, THEN STORE HASH

// 2. List webhooks
const list = await fetch('/merchants/:merchantId/settings/webhooks', {
  headers: { 'Authorization': `Bearer ${token}` },
});
const webhooks = await list.json();
// → [{ id, url, secret, active, label, createdAt }, ...]

// 3. Toggle off
await fetch(`/merchants/:merchantId/settings/webhooks/${webhookId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ active: false }),
});

// 4. Rotate secret
const rotated = await fetch(
  `/merchants/:merchantId/settings/webhooks/${webhookId}/rotate-secret`,
  { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
);
const { secret } = await rotated.json();
// → SHOW secret to user ONE TIME

// 5. Delete
await fetch(`/merchants/:merchantId/settings/webhooks/${webhookId}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` },
});
```
