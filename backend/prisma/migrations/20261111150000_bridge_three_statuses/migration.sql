-- Bridge transfers only have three statuses: PENDING, COMPLETED, FAILED.
-- Fold the provider/bookkeeping states written before this change.
UPDATE "bridge_transactions" SET "status" = 'COMPLETED' WHERE "status" = 'SUCCESS';
UPDATE "bridge_transactions" SET "status" = 'FAILED' WHERE "status" IN ('REJECTED', 'REVERSED', 'EXPIRED', 'CANCELLED');
UPDATE "bridge_transactions" SET "status" = 'PENDING' WHERE "status" IN ('PROCESSING', 'WAITING', 'DELAYED', 'STUCK');
