-- CreateEnum
CREATE TYPE "LicensingStatus" AS ENUM ('UNLICENSED', 'PENDING', 'LICENSED', 'PARTNERED');

-- CreateTable
CREATE TABLE "corridors" (
    "id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "fiat_currency" VARCHAR(3) NOT NULL,
    "stablecoin_code" VARCHAR(12) NOT NULL,
    "stablecoin_issuer" TEXT NOT NULL,
    "ramp_processor_provider" TEXT NOT NULL,
    "licensing_status" "LicensingStatus" NOT NULL DEFAULT 'UNLICENSED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "corridors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corridors_country_code_fiat_currency_key" ON "corridors"("country_code", "fiat_currency");

-- CreateIndex
CREATE INDEX "corridors_is_active_idx" ON "corridors"("is_active");
