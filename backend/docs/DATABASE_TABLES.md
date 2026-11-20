# Database tables

Generated from `prisma/schema.prisma`. PostgreSQL, `relationMode = "prisma"` (relations are enforced by the Prisma client, not by database foreign keys).

**42 tables.** Purposes marked *(inferred)* come from names and fields, not from reading all the code that uses them.

## Index

| Model | Table | Columns | What it is |
|---|---|---:|---|
| User | `users` | 19 | Every end-user account. Holds login, role, wallet/phone, merchant/OTC/API flags and the Bitnob customer + virtual account ids. |
| Admin | `admins` | 8 | Back-office administrators. |
| WaitlistEntry | `waitlist_entries` | 13 | Sign-ups from the waitlist page (profile and origin). |
| Otp | `otps` | 7 | One-time codes for email login/verification. |
| OnrampTransaction | `onramp_transactions` | 23 | A user NGN/GHS/KES to USDC order: amount, destination wallet, deposit account, status, provider metadata. |
| OfframpTransaction | `offramp_transactions` | 25 | A user USDC to local-currency order: bank details, status (state machine), provider order link, metadata (SafeHaven/CCTP relay). |
| SwapTransaction | `swap_transactions` | 22 | A user token swap (on-chain) record. |
| WebhookEvent | `webhook_events` | 12 | Processed provider webhook events tied to a transaction (audit of what we did). |
| TransactionLog | `transaction_logs` | 10 | Status-change audit trail for any transaction type. |
| TransactionFee | `transaction_fees` | 8 | Fee records per transaction (inferred from name and fields). |
| SupportedToken | `supported_tokens` | 10 | Token catalogue. NOT referenced anywhere in the code. |
| ApiKey | `api_keys` | 11 | API keys issued to users. |
| ApiRequestLog | `api_request_logs` | 12 | Request log for user API keys. |
| Merchant | `merchants` | 20 | A business account (KYB status, Bitnob/SafeHaven ids, settlement config). The largest model. |
| MerchantWebhook | `merchant_webhooks` | 8 | Webhook endpoints a merchant registered to receive events. |
| MerchantDocumentation | `merchant_documentations` | 14 | KYB documents uploaded by a merchant. |
| MerchantDirector | `merchant_directors` | 12 | Directors of a merchant (KYB). |
| MerchantShareholder | `merchant_shareholders` | 12 | Shareholders of a merchant (KYB). |
| MerchantOnrampTransaction | `merchant_onramp_transactions` | 21 | Merchant version of the on-ramp order. |
| MerchantOfframpTransaction | `merchant_offramp_transactions` | 21 | Merchant version of the off-ramp order. |
| OfframpProviderOrder | `offramp_provider_orders` | 22 | The Bitnob payout behind an off-ramp: funding address, expected/received amounts, expiry, status. |
| OfframpReconciliation | `offramp_reconciliations` | 17 | Per-cash-out reconciliation record (conversion, payout, failure detail). |
| OfframpReversal | `offramp_reversals` | 7 | Reversal/refund record for a failed off-ramp. |
| OfframpEvent | `offramp_events` | 6 | Off-ramp state-machine history; the unique event key makes steps idempotent. |
| MerchantSwapTransaction | `merchant_swap_transactions` | 22 | Merchant version of the swap record. |
| MerchantBankTransfer | `merchant_bank_transfers` | 18 | Payouts a merchant sends to bank accounts. |
| MerchantApiKey | `merchant_api_keys` | 11 | API keys issued to merchants. |
| MerchantApiRequestLog | `merchant_api_request_logs` | 12 | Request log for merchant API keys. |
| MerchantBankAccount | `merchant_bank_accounts` | 11 | Bank accounts a merchant saved as beneficiaries. |
| MerchantSettlementAccount | `merchant_settlement_accounts` | 9 | Where a merchant is settled. |
| MerchantSubAccount | `merchant_sub_accounts` | 10 | Sub-accounts (SafeHaven) created per merchant. |
| VirtualAccount | `virtual_accounts` | 20 | Virtual bank accounts (Bitnob/SafeHaven) for users or merchants. |
| UserWallet | `user_wallets` | 7 | Wallet addresses a user saved. |
| UserBankAccount | `user_bank_accounts` | 10 | Bank accounts a user saved. |
| BridgeTransaction | `bridge_transactions` | 16 | Cross-chain bridge transfers (CCTP) with source/destination hashes and status. |
| SafeHavenStablestackLog | `safehaven_stablestack_logs` | 8 | Raw payload log of SafeHaven/Stablestack transfers. |
| OtcUser | `otc_users` | 16 | OTC profile for a user (BVN/NIN, SafeHaven sub-account). |
| OtcTransaction | `otc_transactions` | 23 | OTC trades. |
| MerchantWebhookLog | `merchant_webhook_logs` | 13 | Delivery log for merchant webhooks. |
| MerchantAuditLog | `merchant_audit_logs` | 13 | Audit log of merchant actions. |
| VasTransaction | `vas_transactions` | 24 | Airtime, data, cable TV and utility purchases. |
| InboundWebhook | `inbound_webhooks` | 11 | Raw inbound provider webhooks queued for processing. |

## Enums

- **VirtualAccountStatus**: ACTIVE, EXPIRED, CLOSED, FAILED
- **UserRole**: USER, ADMIN
- **TransactionStatus**: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED, DISPUTED, REJECTED, EXPIRED, PARTIAL, REVERSED, INITIATED, AWAITING_DEPOSIT, DEPOSIT_DETECTED, CONVERSION_PENDING, PAYOUT_PENDING, PARTIALLY_SETTLED, INSUFFICIENT_LIQUIDITY
- **TransactionType**: onramp, offramp, swap, otc, vas
- **FiatProvider**: SAFEHAVEN, PULSE_MFB
- **MerchantStatus**: PENDING, VERIFIED, REJECTED

## Tables in detail

### `users` (User)

Every end-user account. Holds login, role, wallet/phone, merchant/OTC/API flags and the Bitnob customer + virtual account ids.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `email` | String | unique |
| `password` | String? |  |
| `phone_number` | String? |  |
| `wallet_address` | String? |  |
| `role` | UserRole | default USER |
| `is_merchant` | Boolean | default false |
| `business_name` | String? |  |
| `website_url` | String? |  |
| `contact_name` | String? |  |
| `is_api_access_approved` | Boolean | default false |
| `is_otc_enabled` | Boolean | default false |
| `suspended` | Boolean | default false |
| `suspended_at` | DateTime? |  |
| `bitnob_customer_id` | String? |  |
| `bitnob_virtual_account` | Json? |  |
| `last_active_at` | DateTime? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** merchant: Merchant?, onrampTransactions: OnrampTransaction[], offrampTransactions: OfframpTransaction[], swapTransactions: SwapTransaction[], transactionLogs: TransactionLog[], apiKeys: ApiKey[], apiRequestLogs: ApiRequestLog[], wallets: UserWallet[], bankAccounts: UserBankAccount[], virtualAccounts: VirtualAccount[], bridgeTransactions: BridgeTransaction[], otcUser: OtcUser?, otcTransactions: OtcTransaction[]

**Indexes:** `@@index([email])`; `@@index([isMerchant])`; `@@index([lastActiveAt])`

### `admins` (Admin)

Back-office administrators.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `email` | String | unique |
| `password` | String |  |
| `first_name` | String? |  |
| `last_name` | String? |  |
| `is_active` | Boolean | default true |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Indexes:** `@@index([email])`

### `waitlist_entries` (WaitlistEntry)

Sign-ups from the waitlist page (profile and origin).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `email` | String | unique |
| `name` | String? |  |
| `phone_number` | String? |  |
| `user_type` | String? |  |
| `phone_country` | String? |  |
| `country` | String? |  |
| `referrer` | String? |  |
| `utm_source` | String? |  |
| `utm_medium` | String? |  |
| `utm_campaign` | String? |  |
| `source` | String? |  |
| `created_at` | DateTime | default now() |

**Indexes:** `@@index([createdAt])`

### `otps` (Otp)

One-time codes for email login/verification.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `email` | String |  |
| `code` | String |  |
| `purpose` | String | default "SIGNUP" |
| `is_used` | Boolean | default false |
| `expires_at` | DateTime |  |
| `created_at` | DateTime | default now() |

**Indexes:** `@@index([email])`; `@@index([code])`; `@@index([expiresAt])`; `@@index([isUsed])`

### `onramp_transactions` (OnrampTransaction)

A user NGN/GHS/KES to USDC order: amount, destination wallet, deposit account, status, provider metadata.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String |  |
| `reference` | String | unique |
| `amount` | Decimal |  |
| `currency` | String | default "NGN" |
| `token_amount` | Decimal? |  |
| `token_type` | String | default "CNGN" |
| `status` | TransactionStatus | default PENDING |
| `flint_transaction_id` | String? |  |
| `destination_address` | String |  |
| `network` | String? |  |
| `notify_url` | String? |  |
| `deposit_account` | Json? |  |
| `safehaven_account` | Json? |  |
| `pulse_mfb_account` | Json? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `transaction_location` | String? |  |
| `webhook_payload` | Json? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** user: User? (FK in client)

**Indexes:** `@@index([userId])`; `@@index([reference])`; `@@index([status])`; `@@index([tokenType])`; `@@index([createdAt])`

### `offramp_transactions` (OfframpTransaction)

A user USDC to local-currency order: bank details, status (state machine), provider order link, metadata (SafeHaven/CCTP relay).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String |  |
| `reference` | String | unique |
| `amount` | Decimal |  |
| `fiat_amount` | Decimal? |  |
| `currency` | String | default "NGN" |
| `token_type` | String | default "CNGN" |
| `status` | TransactionStatus | default PENDING |
| `flint_transaction_id` | String? |  |
| `swap_id` | String? | unique |
| `bank_code` | String |  |
| `account_number` | String |  |
| `account_name` | String? |  |
| `bank_name` | String? |  |
| `network` | String? |  |
| `notify_url` | String? |  |
| `safehaven_account` | Json? |  |
| `pulse_mfb_account` | Json? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |
| `settled_fiat_amount` | Decimal? |  |

**Relations:** providerOrder: OfframpProviderOrder?, user: User? (FK in client), swapTransaction: SwapTransaction? (FK in client), reconciliation: OfframpReconciliation?, reversal: OfframpReversal?, events: OfframpEvent[]

**Indexes:** `@@index([userId])`; `@@index([reference])`; `@@index([status])`; `@@index([tokenType])`; `@@index([accountNumber])`; `@@index([createdAt])`

### `swap_transactions` (SwapTransaction)

A user token swap (on-chain) record.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String |  |
| `reference` | String | unique |
| `from_token_type` | String |  |
| `from_amount` | Decimal |  |
| `from_network` | String? |  |
| `to_token_type` | String |  |
| `to_amount` | Decimal |  |
| `to_network` | String? |  |
| `exchange_rate` | Decimal |  |
| `source_address` | String |  |
| `destination_address` | String |  |
| `status` | TransactionStatus | default PENDING |
| `transaction_hash` | String? |  |
| `fee_amount` | Decimal? |  |
| `fee_currency` | String? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** user: User? (FK in client), offrampTransaction: OfframpTransaction?

**Indexes:** `@@index([userId])`; `@@index([reference])`; `@@index([status])`; `@@index([fromTokenType])`; `@@index([toTokenType])`; `@@index([createdAt])`

### `webhook_events` (WebhookEvent)

Processed provider webhook events tied to a transaction (audit of what we did).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `transaction_type` | TransactionType |  |
| `transaction_id` | String |  |
| `reference` | String |  |
| `event_type` | String? |  |
| `status` | String? |  |
| `provider` | String? |  |
| `payload` | Json |  |
| `processed` | Boolean | default false |
| `processed_at` | DateTime? |  |
| `error_message` | String? |  |
| `created_at` | DateTime | default now() |

**Indexes:** `@@index([transactionId])`; `@@index([reference])`; `@@index([transactionType])`; `@@index([provider])`; `@@index([processed])`; `@@index([createdAt])`

### `transaction_logs` (TransactionLog)

Status-change audit trail for any transaction type.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `transaction_type` | TransactionType |  |
| `transaction_id` | String |  |
| `user_id` | String? |  |
| `action` | String |  |
| `old_status` | String? |  |
| `new_status` | String? |  |
| `description` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |

**Relations:** user: User? (FK in client)

**Indexes:** `@@index([transactionId])`; `@@index([transactionType])`; `@@index([userId])`; `@@index([action])`; `@@index([createdAt])`

### `transaction_fees` (TransactionFee)

Fee records per transaction (inferred from name and fields).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `transaction_id` | String |  |
| `transaction_type` | String |  |
| `fee_amount` | Decimal |  |
| `fee_type` | String |  |
| `fee_currency` | String | default "NGN" |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |

**Indexes:** `@@index([transactionId])`; `@@index([transactionType])`; `@@index([feeType])`; `@@index([createdAt])`

### `supported_tokens` (SupportedToken)

Token catalogue. NOT referenced anywhere in the code.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `token_symbol` | String | unique |
| `token_name` | String |  |
| `token_address` | String? |  |
| `network` | String |  |
| `decimals` | Int | default 18 |
| `is_active` | Boolean | default true |
| `logo_url` | String? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Indexes:** `@@index([tokenSymbol])`; `@@index([network])`; `@@index([isActive])`

### `api_keys` (ApiKey)

API keys issued to users.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String |  |
| `key` | String | unique |
| `key_prefix` | String |  |
| `name` | String? |  |
| `is_active` | Boolean | default true |
| `last_used_at` | DateTime? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `expires_at` | DateTime? |  |
| `metadata` | Json? |  |

**Relations:** user: User (FK in client), apiRequestLogs: ApiRequestLog[]

**Indexes:** `@@index([userId])`; `@@index([key])`; `@@index([isActive])`

### `api_request_logs` (ApiRequestLog)

Request log for user API keys.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `api_key_id` | String? |  |
| `user_id` | String? |  |
| `method` | String |  |
| `path` | String |  |
| `status_code` | Int |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `request_body` | Json? |  |
| `response_body` | Json? |  |
| `error_message` | String? |  |
| `created_at` | DateTime | default now() |

**Relations:** apiKey: ApiKey? (FK in client), user: User? (FK in client)

**Indexes:** `@@index([apiKeyId])`; `@@index([userId])`; `@@index([createdAt])`; `@@index([statusCode])`

### `merchants` (Merchant)

A business account (KYB status, Bitnob/SafeHaven ids, settlement config). The largest model.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String | unique |
| `name` | String | unique |
| `nature_of_business` | String | unique |
| `description` | String? |  |
| `website_url` | String | unique |
| `address_line1` | String? |  |
| `address_line2` | String? |  |
| `city` | String? |  |
| `state` | String? |  |
| `country` | String | default "Nigeria" |
| `postal_code` | String? |  |
| `status` | MerchantStatus | default PENDING |
| `verified_at` | DateTime? |  |
| `rejection_reason` | String? |  |
| `bitnob_customer_id` | String? |  |
| `bitnob_virtual_account` | Json? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** user: User (FK in client), documentations: MerchantDocumentation[], directors: MerchantDirector[], shareholders: MerchantShareholder[], onramps: MerchantOnrampTransaction[], offramps: MerchantOfframpTransaction[], swaps: MerchantSwapTransaction[], bankTransfers: MerchantBankTransfer[], apiKeys: MerchantApiKey[], apiRequestLogs: MerchantApiRequestLog[], bridgeTransactions: BridgeTransaction[], vasTransactions: VasTransaction[], bankAccount: MerchantBankAccount?, settlementAccount: MerchantSettlementAccount?, subAccounts: MerchantSubAccount[], virtualAccounts: VirtualAccount[], webhooks: MerchantWebhook[]

**Indexes:** `@@index([name])`; `@@index([websiteUrl])`; `@@index([status])`

### `merchant_webhooks` (MerchantWebhook)

Webhook endpoints a merchant registered to receive events.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `url` | String |  |
| `secret` | String |  |
| `active` | Boolean | default true |
| `label` | String? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([merchantId])`; `@@index([active])`

### `merchant_documentations` (MerchantDocumentation)

KYB documents uploaded by a merchant.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `cac_certificate` | String? |  |
| `cac_e_status` | String? |  |
| `memart` | String? |  |
| `memorandum` | String? |  |
| `proof_of_address` | String? |  |
| `capital_source` | String? |  |
| `trading_name` | String? |  |
| `tax_identification_number` | String? |  |
| `proof_of_funds` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([tradingName])`; `@@index([taxIdentificationNumber])`

### `merchant_directors` (MerchantDirector)

Directors of a merchant (KYB).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `firstName` | String? |  |
| `lastName` | String? |  |
| `nationality` | String? |  |
| `bvn` | String? |  |
| `proof_of_address` | String? |  |
| `id_type` | String? |  |
| `id_url` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([bvn])`; `@@index([nationality])`

### `merchant_shareholders` (MerchantShareholder)

Shareholders of a merchant (KYB).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `firstName` | String? |  |
| `lastName` | String? |  |
| `nationality` | String? |  |
| `bvn` | String? |  |
| `proof_of_address` | String? |  |
| `id_type` | String? |  |
| `id_url` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([bvn])`; `@@index([nationality])`

### `merchant_onramp_transactions` (MerchantOnrampTransaction)

Merchant version of the on-ramp order.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `reference` | String | unique |
| `amount` | Decimal |  |
| `currency` | String | default "NGN" |
| `token_amount` | Decimal? |  |
| `token_type` | String | default "CNGN" |
| `status` | TransactionStatus | default PENDING |
| `payment_reference` | String? |  |
| `destination_address` | String |  |
| `network` | String? |  |
| `notify_url` | String? |  |
| `deposit_account` | Json? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `transaction_location` | String? |  |
| `webhook_payload` | Json? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([merchantId])`; `@@index([reference])`; `@@index([status])`; `@@index([tokenType])`; `@@index([createdAt])`

### `merchant_offramp_transactions` (MerchantOfframpTransaction)

Merchant version of the off-ramp order.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `reference` | String | unique |
| `amount` | Decimal |  |
| `fiat_amount` | Decimal? |  |
| `currency` | String | default "NGN" |
| `token_type` | String | default "CNGN" |
| `status` | TransactionStatus | default PENDING |
| `payment_reference` | String? |  |
| `bank_code` | String |  |
| `account_number` | String |  |
| `account_name` | String? |  |
| `bank_name` | String? |  |
| `network` | String? |  |
| `notify_url` | String? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** providerOrder: OfframpProviderOrder?, merchant: Merchant (FK in client)

**Indexes:** `@@index([merchantId])`; `@@index([reference])`; `@@index([status])`; `@@index([tokenType])`; `@@index([accountNumber])`; `@@index([createdAt])`

### `offramp_provider_orders` (OfframpProviderOrder)

The Bitnob payout behind an off-ramp: funding address, expected/received amounts, expiry, status.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `offramp_transaction_id` | String? | unique |
| `merchant_offramp_transaction_id` | String? | unique |
| `reference` | String | unique |
| `provider` | String | default "bitnob" |
| `provider_order_id` | String? |  |
| `payment_reference` | String? |  |
| `source_address` | String? |  |
| `provider_status` | String? |  |
| `funding_address` | String? |  |
| `expected_amount` | Decimal? |  |
| `received_amount` | Decimal? |  |
| `memo` | String? |  |
| `expires_at` | DateTime? |  |
| `failure_reason` | String? |  |
| `deposit_tx_hash` | String? |  |
| `bridge_reference` | String? |  |
| `bridge_status` | String? | default "PENDING" |
| `outstanding_amount` | Decimal? |  |
| `failure_detail` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** offrampTransaction: OfframpTransaction? (FK in client), merchantOfframpTransaction: MerchantOfframpTransaction? (FK in client)

**Indexes:** `@@index([providerOrderId])`; `@@index([bridgeReference])`

### `offramp_reconciliations` (OfframpReconciliation)

Per-cash-out reconciliation record (conversion, payout, failure detail).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `offramp_transaction_id` | String | unique |
| `reference` | String | unique |
| `external_reference` | String? |  |
| `stellar_tx_hash` | String? |  |
| `asset` | String | default "USDC" |
| `amount` | Decimal |  |
| `expected_settlement` | Decimal |  |
| `actual_settlement` | Decimal | default 0 |
| `outstanding_amount` | Decimal | default 0 |
| `status` | String |  |
| `failure_reason` | String? |  |
| `failure_detail` | Json? |  |
| `result` | String | default "IN_PROGRESS" |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `settled_at` | DateTime? |  |

**Relations:** offrampTransaction: OfframpTransaction (FK in client)

**Indexes:** `@@index([status])`; `@@index([result])`; `@@index([createdAt])`

### `offramp_reversals` (OfframpReversal)

Reversal/refund record for a failed off-ramp.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `offramp_transaction_id` | String | unique |
| `provider_event_id` | String? | unique |
| `amount` | Decimal |  |
| `reason` | String? |  |
| `original_status` | String |  |
| `created_at` | DateTime | default now() |

**Relations:** offrampTransaction: OfframpTransaction (FK in client)

### `offramp_events` (OfframpEvent)

Off-ramp state-machine history; the unique event key makes steps idempotent.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `offramp_transaction_id` | String |  |
| `event_key` | String | unique |
| `type` | String |  |
| `payload` | Json? |  |
| `created_at` | DateTime | default now() |

**Relations:** offrampTransaction: OfframpTransaction (FK in client)

**Indexes:** `@@index([offrampTransactionId])`

### `merchant_swap_transactions` (MerchantSwapTransaction)

Merchant version of the swap record.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `reference` | String | unique |
| `from_token_type` | String |  |
| `from_amount` | Decimal |  |
| `from_network` | String? |  |
| `to_token_type` | String |  |
| `to_amount` | Decimal |  |
| `to_network` | String? |  |
| `exchange_rate` | Decimal |  |
| `source_address` | String |  |
| `destination_address` | String |  |
| `status` | TransactionStatus | default PENDING |
| `transaction_hash` | String? |  |
| `fee_amount` | Decimal? |  |
| `fee_currency` | String? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([merchantId])`; `@@index([reference])`; `@@index([status])`; `@@index([fromTokenType])`; `@@index([toTokenType])`; `@@index([createdAt])`

### `merchant_bank_transfers` (MerchantBankTransfer)

Payouts a merchant sends to bank accounts.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `reference` | String | unique |
| `amount` | Decimal |  |
| `currency` | String | default "NGN" |
| `beneficiary_bank_code` | String |  |
| `beneficiary_account_number` | String |  |
| `beneficiary_account_name` | String? |  |
| `narration` | String? |  |
| `debit_account_number` | String? |  |
| `status` | TransactionStatus | default PENDING |
| `safehaven_reference` | String? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([merchantId])`; `@@index([reference])`; `@@index([status])`; `@@index([createdAt])`

### `merchant_api_keys` (MerchantApiKey)

API keys issued to merchants.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `key` | String | unique |
| `key_prefix` | String |  |
| `name` | String? |  |
| `is_active` | Boolean | default true |
| `last_used_at` | DateTime? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `expires_at` | DateTime? |  |
| `metadata` | Json? |  |

**Relations:** merchant: Merchant (FK in client), merchantApiRequestLogs: MerchantApiRequestLog[]

**Indexes:** `@@index([merchantId])`; `@@index([key])`; `@@index([isActive])`

### `merchant_api_request_logs` (MerchantApiRequestLog)

Request log for merchant API keys.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_api_key_id` | String? |  |
| `merchant_id` | String? |  |
| `method` | String |  |
| `path` | String |  |
| `status_code` | Int |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `request_body` | Json? |  |
| `response_body` | Json? |  |
| `error_message` | String? |  |
| `created_at` | DateTime | default now() |

**Relations:** merchantApiKey: MerchantApiKey? (FK in client), merchant: Merchant? (FK in client)

**Indexes:** `@@index([merchantApiKeyId])`; `@@index([merchantId])`; `@@index([createdAt])`; `@@index([statusCode])`

### `merchant_bank_accounts` (MerchantBankAccount)

Bank accounts a merchant saved as beneficiaries.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String | unique |
| `fiat_provider` | FiatProvider | default PULSE_MFB |
| `bank_code` | String |  |
| `account_number` | String |  |
| `account_name` | String? |  |
| `bank_name` | String? |  |
| `pulse_mfb_details` | Json? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([accountNumber])`

### `merchant_settlement_accounts` (MerchantSettlementAccount)

Where a merchant is settled.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String | unique |
| `bank_code` | String |  |
| `account_number` | String |  |
| `account_name` | String? |  |
| `bank_name` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([accountNumber])`

### `merchant_sub_accounts` (MerchantSubAccount)

Sub-accounts (SafeHaven) created per merchant.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `safehaven_id` | String |  |
| `bank_code` | String |  |
| `account_number` | String |  |
| `account_name` | String? |  |
| `bank_name` | String? |  |
| `auto_sweep` | Boolean | default true |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@unique([merchantId, accountNumber])`; `@@index([merchantId])`; `@@index([safehavenId])`

### `virtual_accounts` (VirtualAccount)

Virtual bank accounts (Bitnob/SafeHaven) for users or merchants.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String? |  |
| `user_id` | String? |  |
| `reference` | String | unique |
| `external_reference` | String? |  |
| `amount` | Decimal? |  |
| `amount_control` | String? |  |
| `valid_for` | Int? |  |
| `status` | VirtualAccountStatus | default ACTIVE |
| `account_number` | String |  |
| `account_name` | String |  |
| `bank_code` | String |  |
| `bank_name` | String |  |
| `safehaven_response` | Json? |  |
| `expires_at` | DateTime? |  |
| `transaction_id` | String? |  |
| `transaction_type` | String? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `closed_at` | DateTime? |  |

**Relations:** merchant: Merchant? (FK in client), user: User? (FK in client)

**Indexes:** `@@index([merchantId])`; `@@index([userId])`; `@@index([reference])`; `@@index([accountNumber])`; `@@index([status])`; `@@index([expiresAt])`

### `user_wallets` (UserWallet)

Wallet addresses a user saved.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String |  |
| `address` | String |  |
| `network` | String |  |
| `name` | String? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** user: User (FK in client)

**Indexes:** `@@index([userId])`; `@@index([address])`

### `user_bank_accounts` (UserBankAccount)

Bank accounts a user saved.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String |  |
| `bank_code` | String |  |
| `account_number` | String |  |
| `account_name` | String? |  |
| `bank_name` | String? |  |
| `pulse_mfb_details` | Json? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** user: User (FK in client)

**Indexes:** `@@index([userId])`; `@@index([accountNumber])`

### `bridge_transactions` (BridgeTransaction)

Cross-chain bridge transfers (CCTP) with source/destination hashes and status.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `reference` | String | unique |
| `user_id` | String? |  |
| `merchant_id` | String? |  |
| `api_key_id` | String? |  |
| `from_chain` | String |  |
| `to_chain` | String |  |
| `amount` | String |  |
| `source_address` | String |  |
| `destination_address` | String |  |
| `transaction_hash` | String? |  |
| `status` | String | default "PENDING" |
| `metadata` | Json? |  |
| `offramp_reference` | String? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** user: User? (FK in client), merchant: Merchant? (FK in client)

**Indexes:** `@@index([userId])`; `@@index([merchantId])`; `@@index([reference])`; `@@index([offrampReference])`

### `safehaven_stablestack_logs` (SafeHavenStablestackLog)

Raw payload log of SafeHaven/Stablestack transfers.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `transaction_id` | String |  |
| `type` | String |  |
| `safehaven_payload` | Json? |  |
| `stablestack_payload` | Json? |  |
| `status` | String | default "PENDING" |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Indexes:** `@@index([transactionId])`

### `otc_users` (OtcUser)

OTC profile for a user (BVN/NIN, SafeHaven sub-account).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `user_id` | String | unique |
| `bvn` | String? |  |
| `nin` | String? |  |
| `bvn_verified_at` | DateTime? |  |
| `nin_verified_at` | DateTime? |  |
| `bvn_data` | Json? |  |
| `nin_data` | Json? |  |
| `bank_code` | String? |  |
| `bank_name` | String? |  |
| `account_name` | String? |  |
| `account_number` | String? |  |
| `safehaven_details` | Json? |  |
| `pulse_mfb_details` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |

**Relations:** user: User (FK in client), transactions: OtcTransaction[]

**Indexes:** `@@index([userId])`

### `otc_transactions` (OtcTransaction)

OTC trades.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `reference` | String | unique |
| `user_id` | String |  |
| `otc_user_id` | String |  |
| `amount` | Decimal |  |
| `fiat_amount_received` | Decimal? |  |
| `system_fee` | Decimal |  |
| `rate` | Decimal |  |
| `network_fee` | Decimal |  |
| `fee_collected` | Decimal? |  |
| `quantity` | Decimal |  |
| `token_amount_sent` | Decimal? |  |
| `network` | String |  |
| `chain` | String? |  |
| `token` | String |  |
| `address` | String |  |
| `memo` | String? |  |
| `status` | TransactionStatus | default PENDING |
| `meta` | Json? |  |
| `comments` | String? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** user: User (FK in client), otcUser: OtcUser (FK in client)

**Indexes:** `@@index([userId])`; `@@index([reference])`; `@@index([otcUserId])`; `@@index([status])`

### `merchant_webhook_logs` (MerchantWebhookLog)

Delivery log for merchant webhooks.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `event` | String |  |
| `url` | String? |  |
| `payload` | Json |  |
| `status_code` | Int? |  |
| `response` | Json? |  |
| `success` | Boolean | default false |
| `error_message` | String? |  |
| `retry_count` | Int | default 0 |
| `max_retries` | Int | default 3 |
| `next_retry_at` | DateTime? |  |
| `created_at` | DateTime | default now() |

**Indexes:** `@@index([merchantId])`; `@@index([event])`; `@@index([success])`; `@@index([nextRetryAt])`; `@@index([createdAt])`

### `merchant_audit_logs` (MerchantAuditLog)

Audit log of merchant actions.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `action` | String |  |
| `provider` | String? |  |
| `endpoint` | String |  |
| `method` | String |  |
| `request` | Json? |  |
| `response` | Json? |  |
| `status_code` | Int? |  |
| `duration` | Int? |  |
| `success` | Boolean | default true |
| `error_message` | String? |  |
| `created_at` | DateTime | default now() |

**Indexes:** `@@index([merchantId])`; `@@index([action])`; `@@index([provider])`; `@@index([success])`; `@@index([createdAt])`

### `vas_transactions` (VasTransaction)

Airtime, data, cable TV and utility purchases.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `merchant_id` | String |  |
| `reference` | String | unique |
| `service_type` | String |  |
| `service_category_id` | String |  |
| `bundle_code` | String? |  |
| `amount` | Decimal |  |
| `currency` | String | default "NGN" |
| `channel` | String | default "WEB" |
| `phone_number` | String? |  |
| `card_number` | String? |  |
| `meter_number` | String? |  |
| `vend_type` | String? |  |
| `debit_account_number` | String |  |
| `status` | TransactionStatus | default PENDING |
| `safehaven_id` | String? |  |
| `provider_response` | Json? |  |
| `webhook_payload` | Json? |  |
| `ip_address` | String? |  |
| `user_agent` | String? |  |
| `metadata` | Json? |  |
| `created_at` | DateTime | default now() |
| `updated_at` | DateTime |  |
| `completed_at` | DateTime? |  |

**Relations:** merchant: Merchant (FK in client)

**Indexes:** `@@index([merchantId])`; `@@index([reference])`; `@@index([serviceType])`; `@@index([status])`; `@@index([createdAt])`

### `inbound_webhooks` (InboundWebhook)

Raw inbound provider webhooks queued for processing.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK; default uuid() |
| `provider` | String |  |
| `endpoint` | String |  |
| `payload` | Json |  |
| `signature` | String? |  |
| `providerWebhookId` | String? |  |
| `status` | String | default "pending" |
| `error` | String? |  |
| `received_at` | DateTime | default now() |
| `processed_at` | DateTime? |  |
| `created_at` | DateTime | default now() |

**Indexes:** `@@index([provider])`; `@@index([status])`; `@@index([receivedAt])`
