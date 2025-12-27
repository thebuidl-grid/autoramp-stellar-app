/*
  Warnings:

  - A unique constraint covering the columns `[swap_id]` on the table `offramp_transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "offramp_transactions_swap_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "offramp_transactions_swap_id_key" ON "offramp_transactions"("swap_id");
