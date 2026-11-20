/*
  Warnings:

  - You are about to drop the column `webhook_url` on the `merchants` table. All the data in the column will be lost.
  - You are about to drop the `bridge_transactions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_bank_accounts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_wallets` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "merchants" DROP COLUMN "webhook_url";

-- DropTable
DROP TABLE "bridge_transactions";

-- DropTable
DROP TABLE "user_bank_accounts";

-- DropTable
DROP TABLE "user_wallets";

-- CreateTable
CREATE TABLE "merchant_bank_accounts" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT,
    "bankName" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "merchant_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_bank_accounts_accountNumber_idx" ON "merchant_bank_accounts"("accountNumber");
