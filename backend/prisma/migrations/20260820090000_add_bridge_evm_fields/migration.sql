-- AlterTable
ALTER TABLE "bridge_transfers"
  ADD COLUMN "destination_chain" TEXT NOT NULL DEFAULT 'stellar',
  ADD COLUMN "collection_address" TEXT,
  ADD COLUMN "collection_address_encrypted_key" TEXT,
  ADD COLUMN "gas_funding_tx_hash" TEXT,
  ADD COLUMN "payout_stablecoin_code" TEXT,
  ADD COLUMN "payout_amount" DECIMAL(20,7),
  ADD COLUMN "payout_tx_hash" TEXT;
