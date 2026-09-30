-- AlterTable
ALTER TABLE "chain_tokens" ADD COLUMN "fiat_currency" VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE "chain_tokens" ALTER COLUMN "fiat_currency" DROP DEFAULT;
