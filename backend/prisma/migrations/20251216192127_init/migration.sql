-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('onramp', 'offramp', 'swap');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone_number" TEXT,
    "wallet_address" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "kyc_status" "KycStatus" DEFAULT 'PENDING',
    "kyc_verified_at" TIMESTAMP,
    "kyc_rejection_reason" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "middle_name" TEXT,
    "date_of_birth" DATE,
    "gender" "Gender",
    "bvn" TEXT,
    "nin" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'Nigeria',
    "postal_code" TEXT,
    "nok_full_name" TEXT,
    "nok_relationship" TEXT,
    "nok_phone_number" TEXT,
    "nok_address" TEXT,
    "identity_document_type" TEXT,
    "identity_document_number" TEXT,
    "identity_document_url" TEXT,
    "selfie_url" TEXT,
    "metadata" JSONB,
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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_bvn_key" ON "users"("bvn");

-- CreateIndex
CREATE UNIQUE INDEX "users_nin_key" ON "users"("nin");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_bvn_idx" ON "users"("bvn");

-- CreateIndex
CREATE INDEX "users_nin_idx" ON "users"("nin");

-- CreateIndex
CREATE INDEX "users_kyc_status_idx" ON "users"("kyc_status");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_email_idx" ON "admins"("email");

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

-- AddForeignKey
ALTER TABLE "onramp_transactions" ADD CONSTRAINT "onramp_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offramp_transactions" ADD CONSTRAINT "offramp_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
