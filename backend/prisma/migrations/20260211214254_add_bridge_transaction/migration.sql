-- CreateTable
CREATE TABLE "bridge_transactions" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "user_id" UUID,
    "merchant_id" UUID,
    "api_key_id" UUID,
    "from_chain" TEXT NOT NULL,
    "to_chain" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "source_address" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "transaction_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "bridge_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bridge_transactions_reference_key" ON "bridge_transactions"("reference");

-- CreateIndex
CREATE INDEX "bridge_transactions_user_id_idx" ON "bridge_transactions"("user_id");

-- CreateIndex
CREATE INDEX "bridge_transactions_merchant_id_idx" ON "bridge_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "bridge_transactions_reference_idx" ON "bridge_transactions"("reference");
