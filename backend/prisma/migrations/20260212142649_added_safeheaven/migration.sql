-- AlterTable
ALTER TABLE "offramp_transactions" ADD COLUMN     "safehaven_account" JSONB;

-- AlterTable
ALTER TABLE "onramp_transactions" ADD COLUMN     "safehaven_account" JSONB;

-- CreateTable
CREATE TABLE "safehaven_stablestack_logs" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "safehaven_payload" JSONB,
    "stablestack_payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "safehaven_stablestack_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "safehaven_stablestack_logs_transaction_id_idx" ON "safehaven_stablestack_logs"("transaction_id");
