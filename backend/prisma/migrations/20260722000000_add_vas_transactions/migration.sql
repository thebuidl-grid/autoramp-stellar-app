-- AlterEnum: Add 'vas' to TransactionType
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'vas';

-- CreateTable: VasTransaction
CREATE TABLE IF NOT EXISTS "vas_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "service_category_id" TEXT NOT NULL,
    "bundle_code" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "phone_number" TEXT,
    "card_number" TEXT,
    "meter_number" TEXT,
    "vend_type" TEXT,
    "debit_account_number" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "safehaven_id" TEXT,
    "provider_response" JSONB,
    "webhook_payload" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "vas_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "vas_transactions_reference_key" ON "vas_transactions"("reference");
CREATE INDEX IF NOT EXISTS "vas_transactions_merchant_id_idx" ON "vas_transactions"("merchant_id");
CREATE INDEX IF NOT EXISTS "vas_transactions_service_type_idx" ON "vas_transactions"("service_type");
CREATE INDEX IF NOT EXISTS "vas_transactions_status_idx" ON "vas_transactions"("status");
CREATE INDEX IF NOT EXISTS "vas_transactions_created_at_idx" ON "vas_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "vas_transactions" ADD CONSTRAINT "vas_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
