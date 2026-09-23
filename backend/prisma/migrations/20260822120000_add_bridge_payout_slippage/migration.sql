-- AlterTable
ALTER TABLE "bridge_transfers"
  ADD COLUMN "payout_slippage" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
  ADD COLUMN "quoted_payout_amount" DECIMAL(20,7),
  ADD COLUMN "min_payout_amount" DECIMAL(20,7);
