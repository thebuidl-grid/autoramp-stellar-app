-- AlterTable
-- These columns exist in schema.prisma (used by AdminService.approveMerchant /
-- the merchant onboarding flow) but were never captured in a migration —
-- caught by applying the migration history against a clean database.
ALTER TABLE "users" ADD COLUMN "business_name" TEXT;
ALTER TABLE "users" ADD COLUMN "website_url" TEXT;
ALTER TABLE "users" ADD COLUMN "contact_name" TEXT;
ALTER TABLE "users" ADD COLUMN "is_api_access_approved" BOOLEAN NOT NULL DEFAULT false;
