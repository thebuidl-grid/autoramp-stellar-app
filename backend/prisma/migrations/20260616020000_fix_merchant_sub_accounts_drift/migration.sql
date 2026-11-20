-- Fix default on id column
ALTER TABLE "merchant_sub_accounts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Add foreign key on merchant_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_sub_accounts_merchant_id_fkey'
  ) THEN
    ALTER TABLE "merchant_sub_accounts"
      ADD CONSTRAINT "merchant_sub_accounts_merchant_id_fkey"
      FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Ensure unique constraint on (merchant_id, account_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_sub_accounts_merchant_id_account_number_key'
  ) THEN
    ALTER TABLE "merchant_sub_accounts"
      ADD CONSTRAINT "merchant_sub_accounts_merchant_id_account_number_key"
      UNIQUE ("merchant_id", "account_number");
  END IF;
END
$$;

-- Ensure indexes
CREATE INDEX IF NOT EXISTS "merchant_sub_accounts_merchant_id_idx"
  ON "merchant_sub_accounts"("merchant_id");

CREATE INDEX IF NOT EXISTS "merchant_sub_accounts_safehaven_id_idx"
  ON "merchant_sub_accounts"("safehaven_id");
