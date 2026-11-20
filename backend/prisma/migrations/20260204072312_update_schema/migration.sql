/*
  Warnings:

  - You are about to drop the `merchant_bank_accounts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "merchant_bank_accounts";

-- CreateTable
CREATE TABLE "user_bank_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT,
    "bankName" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "user_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_bank_accounts_user_id_idx" ON "user_bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "user_bank_accounts_accountNumber_idx" ON "user_bank_accounts"("accountNumber");
