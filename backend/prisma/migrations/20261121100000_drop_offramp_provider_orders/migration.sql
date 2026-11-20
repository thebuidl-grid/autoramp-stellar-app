-- Drops offramp_provider_orders. Its data now lives on the provider legs (transaction_providers): a BITNOB payout leg and, when
-- funding came over the bridge, a CCTP bridge leg. The code no longer reads or writes this table.
--
-- SAFE BY CONSTRUCTION: it first re-syncs every order into its legs, then REFUSES to drop (the migration fails and rolls back)
-- if any order is not mirrored field-for-field, or is a kind that cannot be mirrored. It only drops once nothing would be lost.
-- Take a fresh backup before applying. Rollback (recreates the table and refills it from the legs):
--   prisma/rollbacks/20261121100000_drop_offramp_provider_orders.down.sql
--
-- Deploy order: roll out the code that uses the legs first, THEN apply this. A release that still reads offramp_provider_orders
-- will fail once the table is gone.

DO $$
DECLARE
  unmappable integer;
  unmirrored integer;
  unmirrored_bridge integer;
BEGIN
  -- 1. Final sync: touching every row fires the mirror trigger, which upserts its payout (and bridge) leg.
  UPDATE offramp_provider_orders SET provider = provider;

  -- 2. Rows that cannot be mirrored would be lost by the drop: no owning transaction, or a provider other than bitnob/stellar.
  SELECT count(*) INTO unmappable
  FROM offramp_provider_orders o
  WHERE COALESCE(o.offramp_transaction_id, o.merchant_offramp_transaction_id) IS NULL
     OR lower(o.provider) NOT IN ('bitnob', 'stellar');
  IF unmappable > 0 THEN
    RAISE EXCEPTION 'refusing to drop offramp_provider_orders: % row(s) cannot be mirrored onto legs (no transaction or unknown provider)', unmappable;
  END IF;

  -- 3. Every payout leg equals its order, field for field.
  SELECT count(*) INTO unmirrored
  FROM offramp_provider_orders o
  WHERE NOT EXISTS (
    SELECT 1 FROM transaction_providers l
    WHERE l.transaction_id = COALESCE(o.offramp_transaction_id, o.merchant_offramp_transaction_id)
      AND l.role = 'PAYOUT' AND l.provider = 'BITNOB'
      AND l.reference           IS NOT DISTINCT FROM o.reference
      AND l.provider_reference  IS NOT DISTINCT FROM o.provider_order_id
      AND l.status              IS NOT DISTINCT FROM o.provider_status
      AND l.expected_amount     IS NOT DISTINCT FROM o.expected_amount
      AND l.received_amount     IS NOT DISTINCT FROM o.received_amount
      AND l.outstanding_amount  IS NOT DISTINCT FROM o.outstanding_amount
      AND l.funding_address     IS NOT DISTINCT FROM o.funding_address
      AND l.memo                IS NOT DISTINCT FROM o.memo
      AND l.expires_at          IS NOT DISTINCT FROM o.expires_at
      AND l.deposit_tx_hash     IS NOT DISTINCT FROM o.deposit_tx_hash
      AND l.source_address      IS NOT DISTINCT FROM o.source_address
      AND l.payment_reference   IS NOT DISTINCT FROM o.payment_reference
      AND l.failure_reason      IS NOT DISTINCT FROM o.failure_reason
      AND l.failure_detail      IS NOT DISTINCT FROM o.failure_detail);
  IF unmirrored > 0 THEN
    RAISE EXCEPTION 'refusing to drop offramp_provider_orders: % order(s) differ from their payout leg', unmirrored;
  END IF;

  -- 4. Every order that has a bridge reference has its CCTP leg.
  SELECT count(*) INTO unmirrored_bridge
  FROM offramp_provider_orders o
  WHERE o.bridge_reference IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM transaction_providers l
    WHERE l.transaction_id = COALESCE(o.offramp_transaction_id, o.merchant_offramp_transaction_id)
      AND l.role = 'BRIDGE' AND l.provider = 'CCTP'
      AND l.provider_reference IS NOT DISTINCT FROM o.bridge_reference
      AND l.status             IS NOT DISTINCT FROM o.bridge_status);
  IF unmirrored_bridge > 0 THEN
    RAISE EXCEPTION 'refusing to drop offramp_provider_orders: % bridge leg(s) missing or different', unmirrored_bridge;
  END IF;
END $$;

-- 5. Nothing would be lost: drop the mirror and the table.
DROP TRIGGER IF EXISTS offramp_provider_orders_sync_legs ON offramp_provider_orders;
DROP FUNCTION IF EXISTS sync_offramp_provider_order_to_legs();
DROP TABLE offramp_provider_orders;
