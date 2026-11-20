-- CreateTable: Create merchant_webhooks table (multi-webhook support)
CREATE TABLE "merchant_webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "merchant_webhooks_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Drop old single-webhook fields from merchants (idempotent)
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "webhook_url";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "webhook_secret";

-- AlterTable: Add retry fields to merchant_webhook_logs
ALTER TABLE "merchant_webhook_logs" ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "merchant_webhook_logs" ADD COLUMN "max_retries" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "merchant_webhook_logs" ADD COLUMN "next_retry_at" TIMESTAMP(6);

-- CreateIndex
CREATE INDEX "merchant_webhooks_merchant_id_idx" ON "merchant_webhooks"("merchant_id");
CREATE INDEX "merchant_webhooks_active_idx" ON "merchant_webhooks"("active");
CREATE INDEX "merchant_webhook_logs_next_retry_at_idx" ON "merchant_webhook_logs"("next_retry_at");

-- AddForeignKey
ALTER TABLE "merchant_webhooks" ADD CONSTRAINT "merchant_webhooks_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
