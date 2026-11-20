/*
  Warnings:

  - You are about to drop the `BridgeTransaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "BridgeTransaction";

-- CreateTable
CREATE TABLE "bridge_transaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "merchantId" TEXT,
    "apiKeyId" TEXT,
    "fromChain" TEXT NOT NULL,
    "toChain" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "sourceAddress" TEXT NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "transactionHash" TEXT,
    "status" TEXT NOT NULL,
    "gasEstimate" TEXT,
    "providerFee" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bridge_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bridge_transaction_reference_key" ON "bridge_transaction"("reference");

-- CreateIndex
CREATE INDEX "bridge_transaction_userId_idx" ON "bridge_transaction"("userId");

-- CreateIndex
CREATE INDEX "bridge_transaction_merchantId_idx" ON "bridge_transaction"("merchantId");

-- CreateIndex
CREATE INDEX "bridge_transaction_reference_idx" ON "bridge_transaction"("reference");

-- CreateIndex
CREATE INDEX "bridge_transaction_status_idx" ON "bridge_transaction"("status");

-- CreateIndex
CREATE INDEX "bridge_transaction_createdAt_idx" ON "bridge_transaction"("createdAt");
