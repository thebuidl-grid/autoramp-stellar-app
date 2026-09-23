-- AlterTable
ALTER TABLE "bridge_transfers"
  ADD COLUMN "payout_token_code" TEXT,
  ADD COLUMN "payout_fiat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payout_bank_code" TEXT,
  ADD COLUMN "payout_account_number" TEXT,
  ADD COLUMN "payout_fiat_currency" TEXT;

-- AlterTable
ALTER TABLE "onramp_transactions"
  ADD COLUMN "payout_chain" TEXT NOT NULL DEFAULT 'stellar',
  ADD COLUMN "payout_token_code" TEXT;
