-- Rollback for 20261121090000_transactions_parent_schema. NOT run by Prisma; run manually with psql if the migration must be undone.
-- Destroys only objects this migration created (and the data in them). Take a backup first if the backfill has been run and used.
-- After running it, also delete the row for this migration from _prisma_migrations so `migrate deploy` can re-apply it:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261121090000_transactions_parent_schema';
BEGIN;

DROP TRIGGER IF EXISTS offramp_provider_orders_sync_legs ON offramp_provider_orders;
DROP FUNCTION IF EXISTS sync_offramp_provider_order_to_legs();

DROP INDEX IF EXISTS "inbound_webhooks_transaction_id_idx";
DROP INDEX IF EXISTS "transaction_logs_leg_id_idx";
DROP INDEX IF EXISTS "webhook_events_inbound_webhook_id_idx";
DROP INDEX IF EXISTS "webhook_events_leg_id_idx";

ALTER TABLE "inbound_webhooks" DROP COLUMN IF EXISTS "transaction_id";
ALTER TABLE "transaction_logs" DROP COLUMN IF EXISTS "leg_id", DROP COLUMN IF EXISTS "outcome", DROP COLUMN IF EXISTS "provider",
  DROP COLUMN IF EXISTS "scope", DROP COLUMN IF EXISTS "step";
ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "inbound_webhook_id", DROP COLUMN IF EXISTS "leg_id";

DROP TABLE IF EXISTS "transaction_providers";
DROP TABLE IF EXISTS "merchant_transactions";
DROP TABLE IF EXISTS "transactions";

DROP TYPE IF EXISTS "LogOutcome";
DROP TYPE IF EXISTS "LegRole";
DROP TYPE IF EXISTS "ProviderName";
DROP TYPE IF EXISTS "LedgerScope";
DROP TYPE IF EXISTS "TransactionKind";

COMMIT;
