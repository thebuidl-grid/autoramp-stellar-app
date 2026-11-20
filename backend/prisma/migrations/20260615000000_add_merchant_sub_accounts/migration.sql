-- Create merchant_sub_accounts table
CREATE TABLE "merchant_sub_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "safehaven_id" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT,
    "bank_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_sub_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "merchant_sub_accounts_merchant_id_account_number_key" UNIQUE ("merchant_id", "account_number")
);

-- Create indexes
CREATE INDEX "merchant_sub_accounts_merchant_id_idx" ON "merchant_sub_accounts"("merchant_id");
CREATE INDEX "merchant_sub_accounts_safehaven_id_idx" ON "merchant_sub_accounts"("safehaven_id");

-- Add foreign key
ALTER TABLE "merchant_sub_accounts" ADD CONSTRAINT "merchant_sub_accounts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
