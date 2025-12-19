/*
  Warnings:

  - You are about to drop the column `address_line1` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `address_line2` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `bvn` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `date_of_birth` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `first_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `gender` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `identity_document_number` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `identity_document_type` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `identity_document_url` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `kyc_rejection_reason` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `kyc_status` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `kyc_verified_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `last_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `middle_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `nin` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `nok_address` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `nok_full_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `nok_phone_number` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `nok_relationship` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `postal_code` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `selfie_url` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_bvn_idx";

-- DropIndex
DROP INDEX "users_bvn_key";

-- DropIndex
DROP INDEX "users_kyc_status_idx";

-- DropIndex
DROP INDEX "users_nin_idx";

-- DropIndex
DROP INDEX "users_nin_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "address_line1",
DROP COLUMN "address_line2",
DROP COLUMN "bvn",
DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "date_of_birth",
DROP COLUMN "first_name",
DROP COLUMN "gender",
DROP COLUMN "identity_document_number",
DROP COLUMN "identity_document_type",
DROP COLUMN "identity_document_url",
DROP COLUMN "kyc_rejection_reason",
DROP COLUMN "kyc_status",
DROP COLUMN "kyc_verified_at",
DROP COLUMN "last_name",
DROP COLUMN "metadata",
DROP COLUMN "middle_name",
DROP COLUMN "nin",
DROP COLUMN "nok_address",
DROP COLUMN "nok_full_name",
DROP COLUMN "nok_phone_number",
DROP COLUMN "nok_relationship",
DROP COLUMN "postal_code",
DROP COLUMN "selfie_url",
DROP COLUMN "state";

-- DropEnum
DROP TYPE "Gender";

-- DropEnum
DROP TYPE "KycStatus";
