-- AlterTable: Add autoSweep to MerchantSubAccount
ALTER TABLE "merchant_sub_accounts" ADD COLUMN IF NOT EXISTS "auto_sweep" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: MerchantBankTransfer
CREATE TABLE "merchant_bank_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "beneficiary_bank_code" TEXT NOT NULL,
    "beneficiary_account_number" TEXT NOT NULL,
    "beneficiary_account_name" TEXT,
    "narration" TEXT,
    "debit_account_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "safehaven_reference" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "merchant_bank_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_bank_transfers_reference_key" ON "merchant_bank_transfers"("reference");
CREATE INDEX "merchant_bank_transfers_merchant_id_idx" ON "merchant_bank_transfers"("merchant_id");
CREATE INDEX "merchant_bank_transfers_status_idx" ON "merchant_bank_transfers"("status");
CREATE INDEX "merchant_bank_transfers_created_at_idx" ON "merchant_bank_transfers"("created_at");

-- AddForeignKey
ALTER TABLE "merchant_bank_transfers" ADD CONSTRAINT "merchant_bank_transfers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
