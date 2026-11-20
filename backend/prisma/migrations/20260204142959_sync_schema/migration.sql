-- CreateTable
CREATE TABLE "user_wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_wallets_user_id_idx" ON "user_wallets"("user_id");

-- CreateIndex
CREATE INDEX "user_wallets_address_idx" ON "user_wallets"("address");
