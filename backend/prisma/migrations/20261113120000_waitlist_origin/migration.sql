-- AlterTable
ALTER TABLE "waitlist_entries" ADD COLUMN     "country" TEXT,
ADD COLUMN     "phone_country" TEXT,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "utm_campaign" TEXT,
ADD COLUMN     "utm_medium" TEXT,
ADD COLUMN     "utm_source" TEXT;
