-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN "provider" TEXT;

-- CreateIndex
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events"("provider");