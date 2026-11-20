-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionStatus" ADD VALUE 'INITIATED';
ALTER TYPE "TransactionStatus" ADD VALUE 'AWAITING_DEPOSIT';
ALTER TYPE "TransactionStatus" ADD VALUE 'DEPOSIT_DETECTED';
ALTER TYPE "TransactionStatus" ADD VALUE 'CONVERSION_PENDING';
ALTER TYPE "TransactionStatus" ADD VALUE 'PAYOUT_PENDING';
ALTER TYPE "TransactionStatus" ADD VALUE 'PARTIALLY_SETTLED';
ALTER TYPE "TransactionStatus" ADD VALUE 'INSUFFICIENT_LIQUIDITY';

-- AlterTable
ALTER TABLE "offramp_transactions" ADD COLUMN     "settled_fiat_amount" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "offramp_provider_orders" ADD COLUMN     "failure_detail" JSONB,
ADD COLUMN     "outstanding_amount" DECIMAL(20,7);

-- CreateTable
CREATE TABLE "offramp_reconciliations" (
    "id" UUID NOT NULL,
    "offramp_transaction_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "external_reference" TEXT,
    "stellar_tx_hash" TEXT,
    "asset" TEXT NOT NULL DEFAULT 'USDC',
    "amount" DECIMAL(20,7) NOT NULL,
    "expected_settlement" DECIMAL(20,7) NOT NULL,
    "actual_settlement" DECIMAL(20,7) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(20,7) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "failure_reason" TEXT,
    "failure_detail" JSONB,
    "result" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "settled_at" TIMESTAMP(6),

    CONSTRAINT "offramp_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offramp_reversals" (
    "id" UUID NOT NULL,
    "offramp_transaction_id" UUID NOT NULL,
    "provider_event_id" TEXT,
    "amount" DECIMAL(20,7) NOT NULL,
    "reason" TEXT,
    "original_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offramp_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offramp_events" (
    "id" UUID NOT NULL,
    "offramp_transaction_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offramp_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offramp_reconciliations_offramp_transaction_id_key" ON "offramp_reconciliations"("offramp_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_reconciliations_reference_key" ON "offramp_reconciliations"("reference");

-- CreateIndex
CREATE INDEX "offramp_reconciliations_status_idx" ON "offramp_reconciliations"("status");

-- CreateIndex
CREATE INDEX "offramp_reconciliations_result_idx" ON "offramp_reconciliations"("result");

-- CreateIndex
CREATE INDEX "offramp_reconciliations_created_at_idx" ON "offramp_reconciliations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_reversals_offramp_transaction_id_key" ON "offramp_reversals"("offramp_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_reversals_provider_event_id_key" ON "offramp_reversals"("provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_events_event_key_key" ON "offramp_events"("event_key");

-- CreateIndex
CREATE INDEX "offramp_events_offramp_transaction_id_idx" ON "offramp_events"("offramp_transaction_id");

