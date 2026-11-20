-- AlterTable
ALTER TABLE "otc_transactions" ADD COLUMN     "fee_collected" DECIMAL(20,2),
ADD COLUMN     "fiat_amount_received" DECIMAL(20,2),
ADD COLUMN     "token_amount_sent" DECIMAL(20,8);
