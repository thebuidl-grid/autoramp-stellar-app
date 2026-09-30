-- CreateEnum
CREATE TYPE "ChainType" AS ENUM ('EVM', 'STELLAR');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'bridge';

-- CreateTable
CREATE TABLE "chains" (
    "id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "chain_type" "ChainType" NOT NULL,
    "cctp_domain" INTEGER NOT NULL,
    "usdc_address" TEXT NOT NULL,
    "token_messenger_address" TEXT,
    "message_transmitter_address" TEXT,
    "cctp_forwarder_address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chains_name_key" ON "chains"("name");

-- CreateIndex
CREATE UNIQUE INDEX "chains_cctp_domain_key" ON "chains"("cctp_domain");

-- CreateIndex
CREATE INDEX "chains_is_active_idx" ON "chains"("is_active");

-- CreateTable
CREATE TABLE "bridge_transfers" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "user_id" UUID,
    "source_chain" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "expected_amount" DECIMAL(20,7),
    "burn_tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_BURN',
    "raw_message" TEXT,
    "raw_attestation" TEXT,
    "mint_tx_hash" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    "completed_at" TIMESTAMP,

    CONSTRAINT "bridge_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bridge_transfers_reference_key" ON "bridge_transfers"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "bridge_transfers_burn_tx_hash_key" ON "bridge_transfers"("burn_tx_hash");

-- CreateIndex
CREATE INDEX "bridge_transfers_status_idx" ON "bridge_transfers"("status");
