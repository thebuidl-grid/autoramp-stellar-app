-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "TransactionStatus" ADD VALUE 'DISPUTED';
ALTER TYPE "TransactionStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'otc';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_otc_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "otc_users" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bvn" TEXT,
    "nin" TEXT,
    "bvn_verified_at" TIMESTAMP(6),
    "nin_verified_at" TIMESTAMP(6),
    "bvn_data" JSONB,
    "nin_data" JSONB,
    "bank_code" TEXT,
    "bank_name" TEXT,
    "account_name" TEXT,
    "account_number" TEXT,
    "safehaven_details" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "otc_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otc_transactions" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "otc_user_id" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "system_fee" DECIMAL(20,2) NOT NULL,
    "rate" DECIMAL(20,2) NOT NULL,
    "network_fee" DECIMAL(20,2) NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "network" TEXT NOT NULL,
    "chain" TEXT,
    "token" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "memo" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "meta" JSONB,
    "comments" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "otc_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "otc_users_user_id_key" ON "otc_users"("user_id");

-- CreateIndex
CREATE INDEX "otc_users_user_id_idx" ON "otc_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "otc_transactions_reference_key" ON "otc_transactions"("reference");

-- CreateIndex
CREATE INDEX "otc_transactions_user_id_idx" ON "otc_transactions"("user_id");

-- CreateIndex
CREATE INDEX "otc_transactions_reference_idx" ON "otc_transactions"("reference");

-- CreateIndex
CREATE INDEX "otc_transactions_otc_user_id_idx" ON "otc_transactions"("otc_user_id");

-- CreateIndex
CREATE INDEX "otc_transactions_status_idx" ON "otc_transactions"("status");
