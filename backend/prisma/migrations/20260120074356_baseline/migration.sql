-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('onramp', 'offramp', 'swap');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "phone_number" TEXT,
    "wallet_address" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "is_merchant" BOOLEAN NOT NULL DEFAULT false,
    "business_name" TEXT,
    "website_url" TEXT,
    "contact_name" TEXT,
    "is_api_access_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otps" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SIGNUP',
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onramp_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "token_amount" DECIMAL(20,8),
    "token_type" TEXT NOT NULL DEFAULT 'CNGN',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "flint_transaction_id" TEXT,
    "destination_address" TEXT NOT NULL,
    "network" TEXT,
    "notify_url" TEXT,
    "deposit_account" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "completed_at" TIMESTAMP,

    CONSTRAINT "onramp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offramp_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "fiat_amount" DECIMAL(20,2),
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "token_type" TEXT NOT NULL DEFAULT 'CNGN',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "flint_transaction_id" TEXT,
    "swap_id" UUID,
    "bank_code" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT,
    "bank_name" TEXT,
    "network" TEXT,
    "notify_url" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "completed_at" TIMESTAMP,

    CONSTRAINT "offramp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "from_token_type" TEXT NOT NULL,
    "from_amount" DECIMAL(20,8) NOT NULL,
    "from_network" TEXT,
    "to_token_type" TEXT NOT NULL,
    "to_amount" DECIMAL(20,8) NOT NULL,
    "to_network" TEXT,
    "exchange_rate" DECIMAL(20,8) NOT NULL,
    "source_address" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "transaction_hash" TEXT,
    "fee_amount" DECIMAL(20,8),
    "fee_currency" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "completed_at" TIMESTAMP,

    CONSTRAINT "swap_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "transaction_type" "TransactionType" NOT NULL,
    "transaction_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "event_type" TEXT,
    "status" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP,
    "error_message" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_logs" (
    "id" UUID NOT NULL,
    "transaction_type" "TransactionType" NOT NULL,
    "transaction_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supported_tokens" (
    "id" UUID NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "token_name" TEXT NOT NULL,
    "token_address" TEXT,
    "network" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "logo_url" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "supported_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "expires_at" TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" UUID NOT NULL,
    "api_key_id" UUID,
    "user_id" UUID,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_body" JSONB,
    "response_body" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nature_of_business" TEXT NOT NULL,
    "description" TEXT,
    "website_url" TEXT NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "postal_code" TEXT,
    "status" "MerchantStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP,
    "rejection_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_bank_accounts" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT,
    "bankName" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "merchant_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_documentations" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "cac_certificate" TEXT,
    "cac_e_status" TEXT,
    "memart" TEXT,
    "memorandum" TEXT,
    "proof_of_address" TEXT,
    "capital_source" TEXT,
    "trading_name" TEXT,
    "tax_identification_number" TEXT,
    "proof_of_funds" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "merchant_documentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_directors" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "nationality" TEXT,
    "bvn" TEXT,
    "proof_of_address" TEXT,
    "id_type" TEXT,
    "id_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "merchant_directors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_shareholders" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "nationality" TEXT,
    "bvn" TEXT,
    "proof_of_address" TEXT,
    "id_type" TEXT,
    "id_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "merchant_shareholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_onramp_transactions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "token_amount" DECIMAL(20,8),
    "token_type" TEXT NOT NULL DEFAULT 'CNGN',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "payment_reference" TEXT,
    "destination_address" TEXT NOT NULL,
    "network" TEXT,
    "notify_url" TEXT,
    "deposit_account" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "completed_at" TIMESTAMP,

    CONSTRAINT "merchant_onramp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_offramp_transactions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "fiat_amount" DECIMAL(20,2),
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "token_type" TEXT NOT NULL DEFAULT 'CNGN',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "payment_reference" TEXT,
    "bank_code" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT,
    "bank_name" TEXT,
    "network" TEXT,
    "notify_url" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "completed_at" TIMESTAMP,

    CONSTRAINT "merchant_offramp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_swap_transactions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "from_token_type" TEXT NOT NULL,
    "from_amount" DECIMAL(20,8) NOT NULL,
    "from_network" TEXT,
    "to_token_type" TEXT NOT NULL,
    "to_amount" DECIMAL(20,8) NOT NULL,
    "to_network" TEXT,
    "exchange_rate" DECIMAL(20,8) NOT NULL,
    "source_address" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "transaction_hash" TEXT,
    "fee_amount" DECIMAL(20,8),
    "fee_currency" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "completed_at" TIMESTAMP,

    CONSTRAINT "merchant_swap_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_api_keys" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "expires_at" TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "merchant_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_api_request_logs" (
    "id" UUID NOT NULL,
    "merchant_api_key_id" UUID,
    "merchant_id" UUID,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_body" JSONB,
    "response_body" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_merchant_idx" ON "users"("is_merchant");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_email_idx" ON "admins"("email");

-- CreateIndex
CREATE INDEX "otps_email_idx" ON "otps"("email");

-- CreateIndex
CREATE INDEX "otps_code_idx" ON "otps"("code");

-- CreateIndex
CREATE INDEX "otps_expires_at_idx" ON "otps"("expires_at");

-- CreateIndex
CREATE INDEX "otps_is_used_idx" ON "otps"("is_used");

-- CreateIndex
CREATE UNIQUE INDEX "onramp_transactions_reference_key" ON "onramp_transactions"("reference");

-- CreateIndex
CREATE INDEX "onramp_transactions_user_id_idx" ON "onramp_transactions"("user_id");

-- CreateIndex
CREATE INDEX "onramp_transactions_reference_idx" ON "onramp_transactions"("reference");

-- CreateIndex
CREATE INDEX "onramp_transactions_status_idx" ON "onramp_transactions"("status");

-- CreateIndex
CREATE INDEX "onramp_transactions_token_type_idx" ON "onramp_transactions"("token_type");

-- CreateIndex
CREATE INDEX "onramp_transactions_created_at_idx" ON "onramp_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_transactions_reference_key" ON "offramp_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_transactions_swap_id_key" ON "offramp_transactions"("swap_id");

-- CreateIndex
CREATE INDEX "offramp_transactions_user_id_idx" ON "offramp_transactions"("user_id");

-- CreateIndex
CREATE INDEX "offramp_transactions_reference_idx" ON "offramp_transactions"("reference");

-- CreateIndex
CREATE INDEX "offramp_transactions_status_idx" ON "offramp_transactions"("status");

-- CreateIndex
CREATE INDEX "offramp_transactions_token_type_idx" ON "offramp_transactions"("token_type");

-- CreateIndex
CREATE INDEX "offramp_transactions_account_number_idx" ON "offramp_transactions"("account_number");

-- CreateIndex
CREATE INDEX "offramp_transactions_created_at_idx" ON "offramp_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "swap_transactions_reference_key" ON "swap_transactions"("reference");

-- CreateIndex
CREATE INDEX "swap_transactions_user_id_idx" ON "swap_transactions"("user_id");

-- CreateIndex
CREATE INDEX "swap_transactions_reference_idx" ON "swap_transactions"("reference");

-- CreateIndex
CREATE INDEX "swap_transactions_status_idx" ON "swap_transactions"("status");

-- CreateIndex
CREATE INDEX "swap_transactions_from_token_type_idx" ON "swap_transactions"("from_token_type");

-- CreateIndex
CREATE INDEX "swap_transactions_to_token_type_idx" ON "swap_transactions"("to_token_type");

-- CreateIndex
CREATE INDEX "swap_transactions_created_at_idx" ON "swap_transactions"("created_at");

-- CreateIndex
CREATE INDEX "webhook_events_transaction_id_idx" ON "webhook_events"("transaction_id");

-- CreateIndex
CREATE INDEX "webhook_events_reference_idx" ON "webhook_events"("reference");

-- CreateIndex
CREATE INDEX "webhook_events_transaction_type_idx" ON "webhook_events"("transaction_type");

-- CreateIndex
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events"("processed");

-- CreateIndex
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events"("created_at");

-- CreateIndex
CREATE INDEX "transaction_logs_transaction_id_idx" ON "transaction_logs"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_logs_transaction_type_idx" ON "transaction_logs"("transaction_type");

-- CreateIndex
CREATE INDEX "transaction_logs_user_id_idx" ON "transaction_logs"("user_id");

-- CreateIndex
CREATE INDEX "transaction_logs_action_idx" ON "transaction_logs"("action");

-- CreateIndex
CREATE INDEX "transaction_logs_created_at_idx" ON "transaction_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "supported_tokens_token_symbol_key" ON "supported_tokens"("token_symbol");

-- CreateIndex
CREATE INDEX "supported_tokens_token_symbol_idx" ON "supported_tokens"("token_symbol");

-- CreateIndex
CREATE INDEX "supported_tokens_network_idx" ON "supported_tokens"("network");

-- CreateIndex
CREATE INDEX "supported_tokens_is_active_idx" ON "supported_tokens"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_is_active_idx" ON "api_keys"("is_active");

-- CreateIndex
CREATE INDEX "api_request_logs_api_key_id_idx" ON "api_request_logs"("api_key_id");

-- CreateIndex
CREATE INDEX "api_request_logs_user_id_idx" ON "api_request_logs"("user_id");

-- CreateIndex
CREATE INDEX "api_request_logs_created_at_idx" ON "api_request_logs"("created_at");

-- CreateIndex
CREATE INDEX "api_request_logs_status_code_idx" ON "api_request_logs"("status_code");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_user_id_key" ON "merchants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_name_key" ON "merchants"("name");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_nature_of_business_key" ON "merchants"("nature_of_business");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_website_url_key" ON "merchants"("website_url");

-- CreateIndex
CREATE INDEX "merchants_name_idx" ON "merchants"("name");

-- CreateIndex
CREATE INDEX "merchants_website_url_idx" ON "merchants"("website_url");

-- CreateIndex
CREATE INDEX "merchants_status_idx" ON "merchants"("status");

-- CreateIndex
CREATE INDEX "merchant_bank_accounts_accountNumber_idx" ON "merchant_bank_accounts"("accountNumber");

-- CreateIndex
CREATE INDEX "merchant_documentations_trading_name_idx" ON "merchant_documentations"("trading_name");

-- CreateIndex
CREATE INDEX "merchant_documentations_tax_identification_number_idx" ON "merchant_documentations"("tax_identification_number");

-- CreateIndex
CREATE INDEX "merchant_directors_bvn_idx" ON "merchant_directors"("bvn");

-- CreateIndex
CREATE INDEX "merchant_directors_nationality_idx" ON "merchant_directors"("nationality");

-- CreateIndex
CREATE INDEX "merchant_shareholders_bvn_idx" ON "merchant_shareholders"("bvn");

-- CreateIndex
CREATE INDEX "merchant_shareholders_nationality_idx" ON "merchant_shareholders"("nationality");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_onramp_transactions_reference_key" ON "merchant_onramp_transactions"("reference");

-- CreateIndex
CREATE INDEX "merchant_onramp_transactions_merchant_id_idx" ON "merchant_onramp_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_onramp_transactions_reference_idx" ON "merchant_onramp_transactions"("reference");

-- CreateIndex
CREATE INDEX "merchant_onramp_transactions_status_idx" ON "merchant_onramp_transactions"("status");

-- CreateIndex
CREATE INDEX "merchant_onramp_transactions_token_type_idx" ON "merchant_onramp_transactions"("token_type");

-- CreateIndex
CREATE INDEX "merchant_onramp_transactions_created_at_idx" ON "merchant_onramp_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_offramp_transactions_reference_key" ON "merchant_offramp_transactions"("reference");

-- CreateIndex
CREATE INDEX "merchant_offramp_transactions_merchant_id_idx" ON "merchant_offramp_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_offramp_transactions_reference_idx" ON "merchant_offramp_transactions"("reference");

-- CreateIndex
CREATE INDEX "merchant_offramp_transactions_status_idx" ON "merchant_offramp_transactions"("status");

-- CreateIndex
CREATE INDEX "merchant_offramp_transactions_token_type_idx" ON "merchant_offramp_transactions"("token_type");

-- CreateIndex
CREATE INDEX "merchant_offramp_transactions_account_number_idx" ON "merchant_offramp_transactions"("account_number");

-- CreateIndex
CREATE INDEX "merchant_offramp_transactions_created_at_idx" ON "merchant_offramp_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_swap_transactions_reference_key" ON "merchant_swap_transactions"("reference");

-- CreateIndex
CREATE INDEX "merchant_swap_transactions_merchant_id_idx" ON "merchant_swap_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_swap_transactions_reference_idx" ON "merchant_swap_transactions"("reference");

-- CreateIndex
CREATE INDEX "merchant_swap_transactions_status_idx" ON "merchant_swap_transactions"("status");

-- CreateIndex
CREATE INDEX "merchant_swap_transactions_from_token_type_idx" ON "merchant_swap_transactions"("from_token_type");

-- CreateIndex
CREATE INDEX "merchant_swap_transactions_to_token_type_idx" ON "merchant_swap_transactions"("to_token_type");

-- CreateIndex
CREATE INDEX "merchant_swap_transactions_created_at_idx" ON "merchant_swap_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_api_keys_key_key" ON "merchant_api_keys"("key");

-- CreateIndex
CREATE INDEX "merchant_api_keys_merchant_id_idx" ON "merchant_api_keys"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_api_keys_key_idx" ON "merchant_api_keys"("key");

-- CreateIndex
CREATE INDEX "merchant_api_keys_is_active_idx" ON "merchant_api_keys"("is_active");

-- CreateIndex
CREATE INDEX "merchant_api_request_logs_merchant_api_key_id_idx" ON "merchant_api_request_logs"("merchant_api_key_id");

-- CreateIndex
CREATE INDEX "merchant_api_request_logs_merchant_id_idx" ON "merchant_api_request_logs"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_api_request_logs_created_at_idx" ON "merchant_api_request_logs"("created_at");

-- CreateIndex
CREATE INDEX "merchant_api_request_logs_status_code_idx" ON "merchant_api_request_logs"("status_code");

-- AddForeignKey
ALTER TABLE "onramp_transactions" ADD CONSTRAINT "onramp_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offramp_transactions" ADD CONSTRAINT "offramp_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offramp_transactions" ADD CONSTRAINT "offramp_transactions_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "swap_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_bank_accounts" ADD CONSTRAINT "merchant_bank_accounts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_documentations" ADD CONSTRAINT "merchant_documentations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_directors" ADD CONSTRAINT "merchant_directors_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_shareholders" ADD CONSTRAINT "merchant_shareholders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_onramp_transactions" ADD CONSTRAINT "merchant_onramp_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_offramp_transactions" ADD CONSTRAINT "merchant_offramp_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_swap_transactions" ADD CONSTRAINT "merchant_swap_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_api_keys" ADD CONSTRAINT "merchant_api_keys_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_api_request_logs" ADD CONSTRAINT "merchant_api_request_logs_merchant_api_key_id_fkey" FOREIGN KEY ("merchant_api_key_id") REFERENCES "merchant_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_api_request_logs" ADD CONSTRAINT "merchant_api_request_logs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
