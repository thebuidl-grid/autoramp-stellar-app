-- AlterTable
ALTER TABLE "bridge_transactions" ADD COLUMN     "offramp_reference" TEXT;

-- CreateIndex
CREATE INDEX "bridge_transactions_offramp_reference_idx" ON "bridge_transactions"("offramp_reference");

-- AlterTable
ALTER TABLE "offramp_provider_orders" ADD COLUMN     "bridge_reference" TEXT,
ADD COLUMN     "bridge_status" TEXT NOT NULL DEFAULT 'PENDING';
