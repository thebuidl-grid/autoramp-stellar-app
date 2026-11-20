-- Create FiatProvider enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FiatProvider') THEN
    CREATE TYPE "FiatProvider" AS ENUM ('SAFEHAVEN', 'PULSE_MFB');
  END IF;
END
$$;

-- Add fiat_provider enum column to merchant_bank_accounts (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_bank_accounts' AND column_name = 'fiat_provider'
  ) THEN
    ALTER TABLE "merchant_bank_accounts" ADD COLUMN "fiat_provider" "FiatProvider" NOT NULL DEFAULT 'PULSE_MFB';
  END IF;
END
$$;

-- Add pulse_mfb_details column to merchant_bank_accounts (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_bank_accounts' AND column_name = 'pulse_mfb_details'
  ) THEN
    ALTER TABLE "merchant_bank_accounts" ADD COLUMN "pulse_mfb_details" JSONB;
  END IF;
END
$$;

-- Create merchant_audit_logs table
CREATE TABLE IF NOT EXISTS "merchant_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "provider" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "status_code" INTEGER,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Create indexes on merchant_audit_logs
CREATE INDEX IF NOT EXISTS "merchant_audit_logs_merchant_id_idx" ON "merchant_audit_logs"("merchant_id");
CREATE INDEX IF NOT EXISTS "merchant_audit_logs_action_idx" ON "merchant_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "merchant_audit_logs_provider_idx" ON "merchant_audit_logs"("provider");
CREATE INDEX IF NOT EXISTS "merchant_audit_logs_success_idx" ON "merchant_audit_logs"("success");
CREATE INDEX IF NOT EXISTS "merchant_audit_logs_created_at_idx" ON "merchant_audit_logs"("created_at");

-- Add foreign key from merchant_audit_logs to merchants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_audit_logs_merchant_id_fkey'
  ) THEN
    ALTER TABLE "merchant_audit_logs"
      ADD CONSTRAINT "merchant_audit_logs_merchant_id_fkey"
      FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Create merchant_webhook_logs table
CREATE TABLE IF NOT EXISTS "merchant_webhook_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- Create indexes on merchant_webhook_logs
CREATE INDEX IF NOT EXISTS "merchant_webhook_logs_merchant_id_idx" ON "merchant_webhook_logs"("merchant_id");
CREATE INDEX IF NOT EXISTS "merchant_webhook_logs_event_idx" ON "merchant_webhook_logs"("event");
CREATE INDEX IF NOT EXISTS "merchant_webhook_logs_success_idx" ON "merchant_webhook_logs"("success");
CREATE INDEX IF NOT EXISTS "merchant_webhook_logs_created_at_idx" ON "merchant_webhook_logs"("created_at");

-- Add foreign key from merchant_webhook_logs to merchants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_webhook_logs_merchant_id_fkey'
  ) THEN
    ALTER TABLE "merchant_webhook_logs"
      ADD CONSTRAINT "merchant_webhook_logs_merchant_id_fkey"
      FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
