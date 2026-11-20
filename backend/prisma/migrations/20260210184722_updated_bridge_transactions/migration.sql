/*
  Warnings:

  - You are about to drop the `bridge_transaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "bridge_transaction";

-- CreateTable
CREATE TABLE "bridge_transactions" (
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

    CONSTRAINT "bridge_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bridge_transactions_reference_key" ON "bridge_transactions"("reference");

-- CreateIndex
CREATE INDEX "bridge_transactions_userId_idx" ON "bridge_transactions"("userId");

-- CreateIndex
CREATE INDEX "bridge_transactions_merchantId_idx" ON "bridge_transactions"("merchantId");

-- CreateIndex
CREATE INDEX "bridge_transactions_reference_idx" ON "bridge_transactions"("reference");

-- CreateIndex
CREATE INDEX "bridge_transactions_status_idx" ON "bridge_transactions"("status");

-- CreateIndex
CREATE INDEX "bridge_transactions_createdAt_idx" ON "bridge_transactions"("createdAt");
