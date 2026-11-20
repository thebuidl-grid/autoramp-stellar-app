-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "webhook_url" TEXT;

-- CreateTable
CREATE TABLE "user_wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bank_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT,
    "bank_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_wallets_user_id_idx" ON "user_wallets"("user_id");

-- CreateIndex
CREATE INDEX "user_wallets_address_idx" ON "user_wallets"("address");

-- CreateIndex
CREATE INDEX "user_bank_accounts_user_id_idx" ON "user_bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "user_bank_accounts_account_number_idx" ON "user_bank_accounts"("account_number");
