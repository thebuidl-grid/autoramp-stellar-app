/*
  Warnings:

  - You are about to drop the `TestTable` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_user_id_fkey";

-- DropForeignKey
ALTER TABLE "api_request_logs" DROP CONSTRAINT "api_request_logs_api_key_id_fkey";

-- DropForeignKey
ALTER TABLE "api_request_logs" DROP CONSTRAINT "api_request_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_api_keys" DROP CONSTRAINT "merchant_api_keys_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_api_request_logs" DROP CONSTRAINT "merchant_api_request_logs_merchant_api_key_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_api_request_logs" DROP CONSTRAINT "merchant_api_request_logs_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_bank_accounts" DROP CONSTRAINT "merchant_bank_accounts_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_directors" DROP CONSTRAINT "merchant_directors_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_documentations" DROP CONSTRAINT "merchant_documentations_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_offramp_transactions" DROP CONSTRAINT "merchant_offramp_transactions_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_onramp_transactions" DROP CONSTRAINT "merchant_onramp_transactions_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_shareholders" DROP CONSTRAINT "merchant_shareholders_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchant_swap_transactions" DROP CONSTRAINT "merchant_swap_transactions_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "merchants" DROP CONSTRAINT "merchants_user_id_fkey";

-- DropForeignKey
ALTER TABLE "offramp_transactions" DROP CONSTRAINT "offramp_transactions_swap_id_fkey";

-- DropForeignKey
ALTER TABLE "offramp_transactions" DROP CONSTRAINT "offramp_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "onramp_transactions" DROP CONSTRAINT "onramp_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "swap_transactions" DROP CONSTRAINT "swap_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_logs" DROP CONSTRAINT "transaction_logs_user_id_fkey";

-- DropTable
DROP TABLE "TestTable";
