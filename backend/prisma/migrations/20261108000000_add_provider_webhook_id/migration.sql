-- AlterTable
ALTER TABLE "inbound_webhooks" ADD COLUMN     "providerWebhookId" TEXT;

-- CreateIndex
CREATE INDEX "inbound_webhooks_providerWebhookId_idx" ON "inbound_webhooks"("providerWebhookId");
