-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "TransactionStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "TransactionStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "offramp_provider_orders" ADD COLUMN     "deposit_tx_hash" TEXT,
ADD COLUMN     "expected_amount" DECIMAL(20,7),
ADD COLUMN     "expires_at" TIMESTAMP(6),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "funding_address" TEXT,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "received_amount" DECIMAL(20,7);
