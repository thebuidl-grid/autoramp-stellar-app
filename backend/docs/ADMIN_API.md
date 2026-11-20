# Admin API Documentation

## User Management

### 1. Update User Flags

Update a user's role-based permissions and feature access flags.

- **URL:** `/admin/users/:userId/flags`
- **Method:** `PATCH`
- **Auth Required:** Yes (Admin Role required)
- **Permissions:** `JwtAuthGuard`, `AdminGuard`

#### Request Body

The request body is a JSON object where all fields are optional.

| Field                 | Type      | Description                                 |
| :-------------------- | :-------- | :------------------------------------------ |
| `isMerchant`          | `boolean` | Set user as a merchant.                     |
| `isApiAccessApproved` | `boolean` | Approve or revoke API access for the user.  |
| `isOTCEnabled`        | `boolean` | Enable or disable OTC feature for the user. |

#### Example Request

```bash
curl -X PATCH https://api.autoramp.com/admin/users/f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e/flags \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "isOTCEnabled": true
  }'
```

#### Successful Response (200 OK)

```json
{
  "user": {
    "id": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
    "email": "user@example.com",
    "isMerchant": false,
    "isApiAccessApproved": false,
    "isOTCEnabled": true,
    "createdAt": "2026-02-26T17:05:30.000Z",
    "updatedAt": "2026-02-26T17:10:00.000Z"
  },
  "message": "User merchant flags updated"
}
```

#### Error Responses

- **401 Unauthorized:** Missing or invalid authentication token.
- **403 Forbidden:** Authenticated user is not an administrator.
- **404 Not Found:** User with the specified ID does not exist.

## Transfer Logs

### 1. List Transfer Logs

Retrieve SafeHaven and Stablestack transfer logs with pagination and filters.

- **URL:** `/admin/transfer-logs`
- **Method:** `GET`
- **Auth Required:** Yes (Admin Role required)

#### Query Parameters

| Parameter       | Type     | Description                                          |
| :-------------- | :------- | :--------------------------------------------------- |
| `page`          | `number` | Page number (default: 1).                            |
| `limit`         | `number` | Items per page (default: 10).                        |
| `transactionId` | `string` | Filter by transaction ID (UUID).                     |
| `status`        | `string` | Filter by status: `PENDING`, `COMPLETED`, `FAILED`.  |
| `startDate`     | `string` | Filter by start date (YYYY-MM-DD).                   |
| `endDate`       | `string` | Filter by end date (YYYY-MM-DD).                     |

#### Example Request

```bash
curl -X GET "https://api.autoramp.com/admin/transfer-logs?page=1&limit=10&status=COMPLETED" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

#### Successful Response (200 OK)

```json
{
  "logs": [
    {
      "id": "a1b2c3d4-...",
      "transactionId": "f8d3e7b1-...",
      "type": "ONRAMP",
      "safehavenPayload": { ... },
      "stablestackPayload": {
        "request": { ... },
        "response": { ... }
      },
      "status": "COMPLETED",
      "createdAt": "2026-05-26T12:00:00.000Z",
      "updatedAt": "2026-05-26T12:00:05.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### 2. Get Transfer Log by Transaction ID

Retrieve all log entries for a specific transaction, including the related transaction details and user info.

- **URL:** `/admin/transfer-logs/:transactionId`
- **Method:** `GET`
- **Auth Required:** Yes (Admin Role required)

#### Example Request

```bash
curl -X GET "https://api.autoramp.com/admin/transfer-logs/f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

#### Successful Response (200 OK)

```json
{
  "logs": [
    {
      "id": "a1b2c3d4-...",
      "transactionId": "f8d3e7b1-...",
      "type": "OFFRAMP",
      "safehavenPayload": { ... },
      "stablestackPayload": {
        "request": { ... },
        "response": { ... }
      },
      "status": "COMPLETED",
      "createdAt": "2026-05-26T12:00:00.000Z",
      "updatedAt": "2026-05-26T12:00:05.000Z"
    }
  ],
  "transaction": {
    "id": "f8d3e7b1-...",
    "reference": "TXN-12345",
    "amount": "500000",
    "status": "COMPLETED",
    "createdAt": "2026-05-26T11:00:00.000Z",
    "_type": "onramp"
  },
  "user": {
    "id": "u123",
    "email": "user@example.com",
    "phoneNumber": "+2348012345678"
  }
}
```

#### Error Responses

- **401 Unauthorized:** Missing or invalid authentication token.
- **403 Forbidden:** Authenticated user is not an administrator.
- **404 Not Found:** No transfer logs found for the given transaction ID.`
