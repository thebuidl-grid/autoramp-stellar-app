/*
  Warnings:

  - You are about to drop the column `accountName` on the `merchant_bank_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `accountNumber` on the `merchant_bank_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `bankCode` on the `merchant_bank_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `bankName` on the `merchant_bank_accounts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[merchant_id]` on the table `merchant_bank_accounts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `account_number` to the `merchant_bank_accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bank_code` to the `merchant_bank_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "merchant_bank_accounts_accountNumber_idx";

-- AlterTable
ALTER TABLE "merchant_bank_accounts" DROP COLUMN "accountName",
DROP COLUMN "accountNumber",
DROP COLUMN "bankCode",
DROP COLUMN "bankName",
ADD COLUMN     "account_name" TEXT,
ADD COLUMN     "account_number" TEXT NOT NULL,
ADD COLUMN     "bank_code" TEXT NOT NULL,
ADD COLUMN     "bank_name" TEXT;

-- CreateTable
CREATE TABLE "merchant_settlement_accounts" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT,
    "bank_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "merchant_settlement_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_settlement_accounts_merchant_id_key" ON "merchant_settlement_accounts"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_settlement_accounts_account_number_idx" ON "merchant_settlement_accounts"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_bank_accounts_merchant_id_key" ON "merchant_bank_accounts"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_bank_accounts_account_number_idx" ON "merchant_bank_accounts"("account_number");
