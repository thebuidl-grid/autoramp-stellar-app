-- CreateTable
CREATE TABLE "BridgeTransaction" (
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

    CONSTRAINT "BridgeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BridgeTransaction_reference_key" ON "BridgeTransaction"("reference");

-- CreateIndex
CREATE INDEX "BridgeTransaction_userId_idx" ON "BridgeTransaction"("userId");

-- CreateIndex
CREATE INDEX "BridgeTransaction_merchantId_idx" ON "BridgeTransaction"("merchantId");

-- CreateIndex
CREATE INDEX "BridgeTransaction_reference_idx" ON "BridgeTransaction"("reference");

-- CreateIndex
CREATE INDEX "BridgeTransaction_status_idx" ON "BridgeTransaction"("status");

-- CreateIndex
CREATE INDEX "BridgeTransaction_createdAt_idx" ON "BridgeTransaction"("createdAt");
