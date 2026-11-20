-- Create enum type if not exists
DO $$ BEGIN
    CREATE TYPE "VirtualAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create virtual_accounts table
CREATE TABLE IF NOT EXISTS "virtual_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "merchant_id" UUID,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "amount_control" TEXT NOT NULL,
    "valid_for" INTEGER NOT NULL,
    "external_reference" TEXT,
    "settlement_account" JSONB NOT NULL,
    "safehaven_response" JSONB NOT NULL,
    "status" "VirtualAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "virtual_accounts_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "virtual_accounts_user_id_idx" ON "virtual_accounts"("user_id");
CREATE INDEX IF NOT EXISTS "virtual_accounts_merchant_id_idx" ON "virtual_accounts"("merchant_id");
CREATE INDEX IF NOT EXISTS "virtual_accounts_reference_idx" ON "virtual_accounts"("reference");
CREATE INDEX IF NOT EXISTS "virtual_accounts_status_idx" ON "virtual_accounts"("status");
CREATE INDEX IF NOT EXISTS "virtual_accounts_expires_at_idx" ON "virtual_accounts"("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "virtual_accounts_reference_key" ON "virtual_accounts"("reference");

-- Add foreign keys
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
