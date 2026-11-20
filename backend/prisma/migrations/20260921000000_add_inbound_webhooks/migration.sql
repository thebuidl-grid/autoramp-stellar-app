-- CreateTable
CREATE TABLE "inbound_webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "received_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_webhooks_provider_idx" ON "inbound_webhooks"("provider");
CREATE INDEX "inbound_webhooks_status_idx" ON "inbound_webhooks"("status");
CREATE INDEX "inbound_webhooks_received_at_idx" ON "inbound_webhooks"("received_at");
