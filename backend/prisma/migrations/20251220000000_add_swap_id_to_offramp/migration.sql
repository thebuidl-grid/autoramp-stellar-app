-- AlterTable
-- Add swapId column to offramp_transactions table
ALTER TABLE "offramp_transactions" ADD COLUMN "swap_id" UUID;

-- CreateIndex
CREATE INDEX "offramp_transactions_swap_id_idx" ON "offramp_transactions"("swap_id");

-- AddForeignKey
-- Add foreign key constraint linking offramp_transactions to swap_transactions
ALTER TABLE "offramp_transactions" ADD CONSTRAINT "offramp_transactions_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "swap_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

