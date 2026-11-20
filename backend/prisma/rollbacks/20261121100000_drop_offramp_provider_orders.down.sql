-- Rollback for 20261121100000_drop_offramp_provider_orders. NOT run by Prisma; run manually with psql.
-- Recreates offramp_provider_orders exactly as it was, refills it from the provider legs (the only copy of its data after the
-- drop), and restores the trigger that mirrors it into the legs. Rows come back with new ids; everything else is identical.
-- Then remove the migration record so `migrate deploy` can re-apply it:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261121100000_drop_offramp_provider_orders';
-- If you need the data exactly as of the drop, restore the pre-migration backup instead.
BEGIN;

CREATE TABLE offramp_provider_orders (
    id uuid NOT NULL,
    offramp_transaction_id uuid,
    merchant_offramp_transaction_id uuid,
    reference text NOT NULL,
    provider text DEFAULT 'bitnob'::text NOT NULL,
    provider_order_id text,
    payment_reference text,
    source_address text,
    provider_status text,
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    deposit_tx_hash text,
    expected_amount numeric(20,7),
    expires_at timestamp(6) without time zone,
    failure_reason text,
    funding_address text,
    memo text,
    received_amount numeric(20,7),
    bridge_reference text,
    bridge_status text DEFAULT 'PENDING'::text NOT NULL,
    failure_detail jsonb,
    outstanding_amount numeric(20,7)
);

ALTER TABLE ONLY offramp_provider_orders
    ADD CONSTRAINT offramp_provider_orders_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX offramp_provider_orders_merchant_offramp_transaction_id_key ON offramp_provider_orders USING btree (merchant_offramp_transaction_id);
CREATE UNIQUE INDEX offramp_provider_orders_offramp_transaction_id_key ON offramp_provider_orders USING btree (offramp_transaction_id);
CREATE INDEX offramp_provider_orders_provider_order_id_idx ON offramp_provider_orders USING btree (provider_order_id);
CREATE UNIQUE INDEX offramp_provider_orders_reference_key ON offramp_provider_orders USING btree (reference);

-- Refill: one row per payout leg; bridge fields come from the transaction's CCTP leg when there is one.
INSERT INTO offramp_provider_orders (
  id, offramp_transaction_id, merchant_offramp_transaction_id, reference, provider, provider_order_id, payment_reference,
  source_address, provider_status, created_at, updated_at, deposit_tx_hash, expected_amount, expires_at, failure_reason,
  funding_address, memo, received_amount, bridge_reference, bridge_status, failure_detail, outstanding_amount)
SELECT gen_random_uuid(),
       CASE WHEN p.scope = 'USER' THEN p.transaction_id END,
       CASE WHEN p.scope = 'MERCHANT' THEN p.transaction_id END,
       p.reference, 'bitnob', p.provider_reference, p.payment_reference,
       p.source_address, p.status, p.created_at, p.updated_at, p.deposit_tx_hash, p.expected_amount, p.expires_at, p.failure_reason,
       p.funding_address, p.memo, p.received_amount, b.provider_reference, COALESCE(b.status, 'PENDING'), p.failure_detail, p.outstanding_amount
FROM transaction_providers p
LEFT JOIN transaction_providers b ON b.transaction_id = p.transaction_id AND b.role = 'BRIDGE' AND b.provider = 'CCTP'
WHERE p.role = 'PAYOUT' AND p.provider = 'BITNOB' AND p.reference IS NOT NULL;

-- Restore the mirror trigger.
CREATE OR REPLACE FUNCTION sync_offramp_provider_order_to_legs() RETURNS trigger AS $fn$
DECLARE
  tx_id uuid := COALESCE(NEW.offramp_transaction_id, NEW.merchant_offramp_transaction_id);
  leg_scope "LedgerScope" := CASE WHEN NEW.offramp_transaction_id IS NOT NULL THEN 'USER' ELSE 'MERCHANT' END;
BEGIN
  IF tx_id IS NULL OR lower(NEW.provider) NOT IN ('bitnob', 'stellar') THEN
    RETURN NEW;
  END IF;

  INSERT INTO transaction_providers (
    id, transaction_id, scope, reference, role, provider, provider_reference, status, details,
    expected_amount, received_amount, outstanding_amount, funding_address, memo, expires_at,
    deposit_tx_hash, source_address, payment_reference, failure_reason, failure_detail, last_event_at, updated_at)
  VALUES (
    gen_random_uuid(), tx_id, leg_scope, NEW.reference, 'PAYOUT', 'BITNOB', NEW.provider_order_id, NEW.provider_status,
    jsonb_strip_nulls(jsonb_build_object('reference', NEW.reference, 'legacyProvider', NEW.provider)),
    NEW.expected_amount, NEW.received_amount, NEW.outstanding_amount, NEW.funding_address, NEW.memo, NEW.expires_at,
    NEW.deposit_tx_hash, NEW.source_address, NEW.payment_reference, NEW.failure_reason, NEW.failure_detail, now(), now())
  ON CONFLICT (transaction_id, role, provider) DO UPDATE SET
    reference = EXCLUDED.reference, provider_reference = EXCLUDED.provider_reference, status = EXCLUDED.status, details = EXCLUDED.details,
    expected_amount = EXCLUDED.expected_amount, received_amount = EXCLUDED.received_amount,
    outstanding_amount = EXCLUDED.outstanding_amount, funding_address = EXCLUDED.funding_address, memo = EXCLUDED.memo,
    expires_at = EXCLUDED.expires_at, deposit_tx_hash = EXCLUDED.deposit_tx_hash, source_address = EXCLUDED.source_address,
    payment_reference = EXCLUDED.payment_reference, failure_reason = EXCLUDED.failure_reason,
    failure_detail = EXCLUDED.failure_detail, last_event_at = now(), updated_at = now();

  IF NEW.bridge_reference IS NOT NULL THEN
    INSERT INTO transaction_providers (id, transaction_id, scope, reference, role, provider, provider_reference, status, details, deposit_tx_hash, last_event_at, updated_at)
    VALUES (gen_random_uuid(), tx_id, leg_scope, NEW.reference, 'BRIDGE', 'CCTP', NEW.bridge_reference, NEW.bridge_status, NULL, NEW.deposit_tx_hash, now(), now())
    ON CONFLICT (transaction_id, role, provider) DO UPDATE SET
      reference = EXCLUDED.reference, provider_reference = EXCLUDED.provider_reference, status = EXCLUDED.status,
      deposit_tx_hash = EXCLUDED.deposit_tx_hash, last_event_at = now(), updated_at = now();
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER offramp_provider_orders_sync_legs
AFTER INSERT OR UPDATE ON offramp_provider_orders
FOR EACH ROW EXECUTE FUNCTION sync_offramp_provider_order_to_legs();

COMMIT;
