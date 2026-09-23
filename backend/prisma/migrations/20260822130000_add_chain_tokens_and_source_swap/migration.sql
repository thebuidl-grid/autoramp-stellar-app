-- CreateTable
CREATE TABLE "chain_tokens" (
    "id" UUID NOT NULL,
    "chain_id" UUID NOT NULL,
    "token_code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 6,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chain_tokens_chain_id_token_code_key" ON "chain_tokens"("chain_id", "token_code");

-- AddForeignKey
ALTER TABLE "chain_tokens" ADD CONSTRAINT "chain_tokens_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "bridge_transfers"
  ADD COLUMN "source_token_code" TEXT,
  ADD COLUMN "source_swap_quote" DECIMAL(30,6),
  ADD COLUMN "source_swap_min_usdc" DECIMAL(20,6);
