# API Endpoint Examples for User Saved Accounts and Wallets

## Authentication
All endpoints listed below require authentication. Include an `Authorization` header with a valid JWT token: `Bearer <your_jwt_token>`.

---
## 1. Saved Account Numbers Endpoints

### 1.1. `POST /user/saved-accounts`
*   **Description:** Add a new saved bank account number for the authenticated user.
*   **Request (CreateSavedAccountNumberDto):**
    ```json
    {
      "accountNumber": "0123456789",
      "bankCode": "000001",
      "bankName": "First Bank of Nigeria"
    }
    ```
*   **Successful Response (201 Created) (SavedAccountNumberResponseDto):**
    ```json
    {
      "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
      "accountNumber": "0123456789",
      "bankCode": "000001",
      "bankName": "First Bank of Nigeria",
      "createdAt": "2026-01-23T10:00:00.000Z",
      "updatedAt": "2026-01-23T10:00:00.000Z"
    }
    ```
*   **Error Response (403 Forbidden - Example):**
    ```json
    {
      "statusCode": 403,
      "message": "Saved account with this number and bank code already exists.",
      "error": "Forbidden"
    }
    ```

### 1.2. `GET /user/saved-accounts`
*   **Description:** Retrieve all saved bank account numbers for the authenticated user.
*   **Request:** (No request body)
*   **Successful Response (200 OK) (Array of SavedAccountNumberResponseDto):**
    ```json
    [
      {
        "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
        "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
        "accountNumber": "0123456789",
        "bankCode": "000001",
        "bankName": "First Bank of Nigeria",
        "createdAt": "2026-01-23T10:00:00.000Z",
        "updatedAt": "2026-01-23T10:00:00.000Z"
      },
      {
        "id": "b1c2d3e4-f5a6-7890-1234-567890fedcba",
        "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
        "accountNumber": "9876543210",
        "bankCode": "000002",
        "bankName": "Zenith Bank",
        "createdAt": "2026-01-22T09:30:00.000Z",
        "updatedAt": "2026-01-22T09:30:00.000Z"
      }
    ]
    ```

### 1.3. `GET /user/saved-accounts/:id` (Example ID: `a1b2c3d4-e5f6-7890-1234-567890abcdef`)
*   **Description:** Retrieve a specific saved bank account number by its ID for the authenticated user.
*   **Request:** (No request body)
*   **Successful Response (200 OK) (SavedAccountNumberResponseDto):**
    ```json
    {
      "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
      "accountNumber": "0123456789",
      "bankCode": "000001",
      "bankName": "First Bank of Nigeria",
      "createdAt": "2026-01-23T10:00:00.000Z",
      "updatedAt": "2026-01-23T10:00:00.000Z"
    }
    ```
*   **Error Response (404 Not Found - Example):**
    ```json
    {
      "statusCode": 404,
      "message": "Saved account with ID a1b2c3d4-e5f6-7890-1234-567890abcdef not found.",
      "error": "Not Found"
    }
    ```

### 1.4. `PATCH /user/saved-accounts/:id` (Example ID: `a1b2c3d4-e5f6-7890-1234-567890abcdef`)
*   **Description:** Update an existing saved bank account number by its ID for the authenticated user.
*   **Request (UpdateSavedAccountNumberDto):**
    ```json
    {
      "bankName": "Updated First Bank"
    }
    ```
*   **Successful Response (200 OK) (SavedAccountNumberResponseDto):**
    ```json
    {
      "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
      "accountNumber": "0123456789",
      "bankCode": "000001",
      "bankName": "Updated First Bank",
      "createdAt": "2026-01-23T10:00:00.000Z",
      "updatedAt": "2026-01-23T10:30:00.000Z"
    }
    ```
*   **Error Response (404 Not Found - Example):**
    ```json
    {
      "statusCode": 404,
      "message": "Saved account with ID a1b2c3d4-e5f6-7890-1234-567890abcdef not found.",
      "error": "Not Found"
    }
    ```

### 1.5. `DELETE /user/saved-accounts/:id` (Example ID: `a1b2c3d4-e5f6-7890-1234-567890abcdef`)
*   **Description:** Delete a saved bank account number by its ID for the authenticated user.
*   **Request:** (No request body)
*   **Successful Response (204 No Content):** (Empty response body)
*   **Error Response (404 Not Found - Example):**
    ```json
    {
      "statusCode": 404,
      "message": "Saved account with ID a1b2c3d4-e5f6-7890-1234-567890abcdef not found.",
      "error": "Not Found"
    }
    ```

---
## 2. User Wallets Endpoints

### 2.1. `POST /user/wallets`
*   **Description:** Add a new user wallet for the authenticated user.
*   **Request (CreateUserWalletDto):**
    ```json
    {
      "walletAddress": "0x123abc...",
      "network": "ethereum",
      "name": "My Main ETH Wallet"
    }
    ```
*   **Successful Response (201 Created) (UserWalletResponseDto):**
    ```json
    {
      "id": "g1h2i3j4-k5l6-7890-1234-567890mnopqr",
      "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
      "walletAddress": "0x123abc...",
      "network": "ethereum",
      "name": "My Main ETH Wallet",
      "createdAt": "2026-01-23T11:00:00.000Z",
      "updatedAt": "2026-01-23T11:00:00.000Z"
    }
    ```
*   **Error Response (403 Forbidden - Example):**
    ```json
    {
      "statusCode": 403,
      "message": "Wallet with this address and network already exists.",
      "error": "Forbidden"
    }
    ```

### 2.2. `GET /user/wallets`
*   **Description:** Retrieve all user wallets for the authenticated user.
*   **Request:** (No request body)
*   **Successful Response (200 OK) (Array of UserWalletResponseDto):**
    ```json
    [
      {
        "id": "g1h2i3j4-k5l6-7890-1234-567890mnopqr",
        "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
        "walletAddress": "0x123abc...",
        "network": "ethereum",
        "name": "My Main ETH Wallet",
        "createdAt": "2026-01-23T11:00:00.000Z",
        "updatedAt": "2026-01-23T11:00:00.000Z"
      },
      {
        "id": "p1q2r3s4-t5u6-7890-1234-567890vwxyz",
        "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
        "walletAddress": "0xdef456...",
        "network": "polygon",
        "name": "Polygon Secondary",
        "createdAt": "2026-01-23T10:45:00.000Z",
        "updatedAt": "2026-01-23T10:45:00.000Z"
      }
    ]
    ```

### 2.3. `GET /user/wallets/:id` (Example ID: `g1h2i3j4-k5l6-7890-1234-567890mnopqr`)
*   **Description:** Retrieve a specific user wallet by its ID for the authenticated user.
*   **Request:** (No request body)
*   **Successful Response (200 OK) (UserWalletResponseDto):**
    ```json
    {
      "id": "g1h2i3j4-k5l6-7890-1234-567890mnopqr",
      "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
      "walletAddress": "0x123abc...",
      "network": "ethereum",
      "name": "My Main ETH Wallet",
      "createdAt": "2026-01-23T11:00:00.000Z",
      "updatedAt": "2026-01-23T11:00:00.000Z"
    }
    ```
*   **Error Response (404 Not Found - Example):**
    ```json
    {
      "statusCode": 404,
      "message": "User wallet with ID g1h2i3j4-k5l6-7890-1234-567890mnopqr not found.",
      "error": "Not Found"
    }
    ```

### 2.4. `PATCH /user/wallets/:id` (Example ID: `g1h2i3j4-k5l6-7890-1234-567890mnopqr`)
*   **Description:** Update an existing user wallet by its ID for the authenticated user.
*   **Request (UpdateUserWalletDto):**
    ```json
    {
      "name": "Primary ETH Wallet"
    }
    ```
*   **Successful Response (200 OK) (UserWalletResponseDto):**
    ```json
    {
      "id": "g1h2i3j4-k5l6-7890-1234-567890mnopqr",
      "userId": "f8d3e7b1-2c5a-4e8d-8a1e-5a0c7b3d1f2e",
      "walletAddress": "0x123abc...",
      "network": "ethereum",
      "name": "Primary ETH Wallet",
      "createdAt": "2026-01-23T11:00:00.000Z",
      "updatedAt": "2026-01-23T11:30:00.000Z"
    }
    ```
*   **Error Response (404 Not Found - Example):**
    ```json
    {
      "statusCode": 404,
      "message": "User wallet with ID g1h2i3j4-k5l6-7890-1234-567890mnopqr not found.",
      "error": "Not Found"
    }
    ```

### 2.5. `DELETE /user/wallets/:id` (Example ID: `g1h2i3j4-k5l6-7890-1234-567890mnopqr`)
*   **Description:** Delete a user wallet by its ID for the authenticated user.
*   **Request:** (No request body)
*   **Successful Response (204 No Content):** (Empty response body)
*   **Error Response (404 Not Found - Example):**
    ```json
    {
      "statusCode": 404,
      "message": "User wallet with ID g1h2i3j4-k5l6-7890-1234-567890mnopqr not found.",
      "error": "Not Found"
    }
    ```
