-- Add Bitnob customer/virtual account caching to users
ALTER TABLE "users" ADD COLUMN "bitnob_customer_id" TEXT;
ALTER TABLE "users" ADD COLUMN "bitnob_virtual_account" JSONB;

-- Add Bitnob customer/virtual account caching to merchants
ALTER TABLE "merchants" ADD COLUMN "bitnob_customer_id" TEXT;
ALTER TABLE "merchants" ADD COLUMN "bitnob_virtual_account" JSONB;

-- CreateTable
CREATE TABLE "offramp_provider_orders" (
    "id" UUID NOT NULL,
    "offramp_transaction_id" UUID,
    "merchant_offramp_transaction_id" UUID,
    "reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'bitnob',
    "provider_order_id" TEXT,
    "payment_reference" TEXT,
    "source_address" TEXT,
    "provider_status" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "offramp_provider_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offramp_provider_orders_offramp_transaction_id_key" ON "offramp_provider_orders"("offramp_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_provider_orders_merchant_offramp_transaction_id_key" ON "offramp_provider_orders"("merchant_offramp_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "offramp_provider_orders_reference_key" ON "offramp_provider_orders"("reference");

-- CreateIndex
CREATE INDEX "offramp_provider_orders_provider_order_id_idx" ON "offramp_provider_orders"("provider_order_id");
