-- Transactions parent tables, provider legs, and webhook/log links (PR 1 of the transactions restructuring).
--
-- ADDITIVE ONLY: creates new enums/tables/indexes and adds nullable (or defaulted) columns. Nothing is dropped, renamed or
-- rewritten, so the running app is unaffected and this can be applied ahead of the code that uses it.
--   * transaction_logs.scope has a constant default, which PostgreSQL applies as a metadata-only change (no table rewrite).
--   * offramp_provider_orders is kept IN SYNC with transaction_providers by a trigger (below) for as long as both exist, so writes by
--     the currently deployed code are never lost. The trigger is removed together with that table.
--   * Data is NOT copied here. Run scripts/backfill-transactions.sql afterwards (idempotent), then
--     scripts/verify-transactions-backfill.sql. Rollback: prisma/rollbacks/20261121090000_transactions_parent_schema.down.sql
--
-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('ONRAMP', 'OFFRAMP', 'SWAP', 'OTC', 'BRIDGE', 'VAS');

-- CreateEnum
CREATE TYPE "LedgerScope" AS ENUM ('USER', 'MERCHANT');

-- CreateEnum
CREATE TYPE "ProviderName" AS ENUM ('BITNOB', 'SAFEHAVEN', 'PULSE_MFB', 'BLOCKRADAR', 'FLINT', 'CCTP');

-- CreateEnum
CREATE TYPE "LegRole" AS ENUM ('FUNDING', 'BRIDGE', 'CONVERSION', 'PAYOUT', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "LogOutcome" AS ENUM ('OK', 'FAILED', 'RETRY', 'SKIPPED');

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "inbound_webhook_id" UUID,
ADD COLUMN     "leg_id" UUID;

-- AlterTable
ALTER TABLE "transaction_logs" ADD COLUMN     "leg_id" UUID,
ADD COLUMN     "outcome" "LogOutcome",
ADD COLUMN     "provider" "ProviderName",
ADD COLUMN     "scope" "LedgerScope" NOT NULL DEFAULT 'USER',
ADD COLUMN     "step" TEXT;

-- AlterTable
ALTER TABLE "inbound_webhooks" ADD COLUMN     "transaction_id" UUID;

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "type" "TransactionKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "user_id" UUID,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(28,8),
    "currency" TEXT,
    "network" TEXT,
    "context" JSONB,
    "destination" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "completed_at" TIMESTAMP(6),
    "related_id" UUID,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_transactions" (
    "id" UUID NOT NULL,
    "type" "TransactionKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "merchant_id" UUID NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(28,8),
    "currency" TEXT,
    "network" TEXT,
    "context" JSONB,
    "destination" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "completed_at" TIMESTAMP(6),
    "related_id" UUID,

    CONSTRAINT "merchant_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_providers" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "scope" "LedgerScope" NOT NULL DEFAULT 'USER',
    "reference" TEXT,
    "role" "LegRole" NOT NULL,
    "provider" "ProviderName" NOT NULL,
    "provider_reference" TEXT,
    "status" TEXT,
    "details" JSONB,
    "expected_amount" DECIMAL(20,7),
    "received_amount" DECIMAL(20,7),
    "outstanding_amount" DECIMAL(20,7),
    "funding_address" TEXT,
    "memo" TEXT,
    "expires_at" TIMESTAMP(6),
    "deposit_tx_hash" TEXT,
    "source_address" TEXT,
    "payment_reference" TEXT,
    "failure_detail" JSONB,
    "last_event_at" TIMESTAMP(6),
    "failed_step" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "transaction_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_reference_idx" ON "transactions"("reference");

-- CreateIndex
CREATE INDEX "transactions_related_id_idx" ON "transactions"("related_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_type_reference_key" ON "transactions"("type", "reference");

-- CreateIndex
CREATE INDEX "merchant_transactions_reference_idx" ON "merchant_transactions"("reference");

-- CreateIndex
CREATE INDEX "merchant_transactions_related_id_idx" ON "merchant_transactions"("related_id");

-- CreateIndex
CREATE INDEX "merchant_transactions_merchant_id_idx" ON "merchant_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_transactions_type_idx" ON "merchant_transactions"("type");

-- CreateIndex
CREATE INDEX "merchant_transactions_status_idx" ON "merchant_transactions"("status");

-- CreateIndex
CREATE INDEX "merchant_transactions_created_at_idx" ON "merchant_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_transactions_type_reference_key" ON "merchant_transactions"("type", "reference");

-- CreateIndex
CREATE INDEX "transaction_providers_reference_idx" ON "transaction_providers"("reference");

-- CreateIndex
CREATE INDEX "transaction_providers_provider_provider_reference_idx" ON "transaction_providers"("provider", "provider_reference");

-- CreateIndex
CREATE INDEX "transaction_providers_transaction_id_idx" ON "transaction_providers"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_providers_transaction_id_role_provider_key" ON "transaction_providers"("transaction_id", "role", "provider");

-- CreateIndex
CREATE INDEX "webhook_events_leg_id_idx" ON "webhook_events"("leg_id");

-- CreateIndex
CREATE INDEX "webhook_events_inbound_webhook_id_idx" ON "webhook_events"("inbound_webhook_id");

-- CreateIndex
CREATE INDEX "transaction_logs_leg_id_idx" ON "transaction_logs"("leg_id");

-- CreateIndex
CREATE INDEX "inbound_webhooks_transaction_id_idx" ON "inbound_webhooks"("transaction_id");


-- ───────────────────────── keep legs in sync with offramp_provider_orders ─────────────────────────
-- Until the code writes transaction_providers directly and offramp_provider_orders is dropped, every insert/update on the old
-- table is mirrored into its legs: a BITNOB payout leg and, when there is a bridge_reference, a CCTP bridge leg. The old table
-- is the source of truth during this window, so the mirror overwrites the leg's copied fields on every change. An order with
-- no parent transaction, or whose provider is neither bitnob nor stellar ('stellar' is the legacy name of 3 demo rows that carry
-- Bitnob events), is ignored rather than guessed at.
CREATE OR REPLACE FUNCTION sync_offramp_provider_order_to_legs() RETURNS trigger AS $fn$
DECLARE
  tx_id uuid := COALESCE(NEW.offramp_transaction_id, NEW.merchant_offramp_transaction_id);
  leg_scope "LedgerScope" := CASE WHEN NEW.offramp_transaction_id IS NOT NULL THEN 'USER' ELSE 'MERCHANT' END;
BEGIN
  IF tx_id IS NULL OR lower(NEW.provider) NOT IN ('bitnob', 'stellar') THEN
    RETURN NEW;
  END IF;

  INSERT INTO transaction_providers (
    id, transaction_id, scope, reference, role, provider, provider_reference, status, details,
    expected_amount, received_amount, outstanding_amount, funding_address, memo, expires_at,
    deposit_tx_hash, source_address, payment_reference, failure_reason, failure_detail, last_event_at, updated_at)
  VALUES (
    gen_random_uuid(), tx_id, leg_scope, NEW.reference, 'PAYOUT', 'BITNOB', NEW.provider_order_id, NEW.provider_status,
    jsonb_strip_nulls(jsonb_build_object('reference', NEW.reference, 'legacyProvider', NEW.provider)),
    NEW.expected_amount, NEW.received_amount, NEW.outstanding_amount, NEW.funding_address, NEW.memo, NEW.expires_at,
    NEW.deposit_tx_hash, NEW.source_address, NEW.payment_reference, NEW.failure_reason, NEW.failure_detail, now(), now())
  ON CONFLICT (transaction_id, role, provider) DO UPDATE SET
    reference = EXCLUDED.reference, provider_reference = EXCLUDED.provider_reference, status = EXCLUDED.status, details = EXCLUDED.details,
    expected_amount = EXCLUDED.expected_amount, received_amount = EXCLUDED.received_amount,
    outstanding_amount = EXCLUDED.outstanding_amount, funding_address = EXCLUDED.funding_address, memo = EXCLUDED.memo,
    expires_at = EXCLUDED.expires_at, deposit_tx_hash = EXCLUDED.deposit_tx_hash, source_address = EXCLUDED.source_address,
    payment_reference = EXCLUDED.payment_reference, failure_reason = EXCLUDED.failure_reason,
    failure_detail = EXCLUDED.failure_detail, last_event_at = now(), updated_at = now();

  IF NEW.bridge_reference IS NOT NULL THEN
    INSERT INTO transaction_providers (id, transaction_id, scope, reference, role, provider, provider_reference, status, details, deposit_tx_hash, last_event_at, updated_at)
    VALUES (gen_random_uuid(), tx_id, leg_scope, NEW.reference, 'BRIDGE', 'CCTP', NEW.bridge_reference, NEW.bridge_status, NULL, NEW.deposit_tx_hash, now(), now())
    ON CONFLICT (transaction_id, role, provider) DO UPDATE SET
      reference = EXCLUDED.reference, provider_reference = EXCLUDED.provider_reference, status = EXCLUDED.status,
      deposit_tx_hash = EXCLUDED.deposit_tx_hash, last_event_at = now(), updated_at = now();
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER offramp_provider_orders_sync_legs
AFTER INSERT OR UPDATE ON offramp_provider_orders
FOR EACH ROW EXECUTE FUNCTION sync_offramp_provider_order_to_legs();
