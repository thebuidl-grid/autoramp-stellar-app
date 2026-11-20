-- Reconciles the transactions restructuring against the source tables. Read-only. Raises an exception (non-zero exit with
-- psql -v ON_ERROR_STOP=1) if anything that must match does not, and prints the informational counts.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-transactions-backfill.sql
-- Counts are compared with "parent >= detail" only because rows may legitimately arrive between backfill and verify; re-run the
-- backfill first if a check fails, and investigate only if it still fails.
DO $$
DECLARE
  r record;
  failures text := '';
  missing_payout boolean := false;
  differs boolean := false;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('transactions ONRAMP',  (SELECT count(*) FROM transactions WHERE type='ONRAMP'),  (SELECT count(*) FROM onramp_transactions)),
      ('transactions OFFRAMP', (SELECT count(*) FROM transactions WHERE type='OFFRAMP'), (SELECT count(*) FROM offramp_transactions)),
      ('transactions SWAP',    (SELECT count(*) FROM transactions WHERE type='SWAP'),    (SELECT count(*) FROM swap_transactions)),
      ('transactions OTC',     (SELECT count(*) FROM transactions WHERE type='OTC'),     (SELECT count(*) FROM otc_transactions)),
      ('transactions BRIDGE',  (SELECT count(*) FROM transactions WHERE type='BRIDGE'),  (SELECT count(*) FROM bridge_transactions WHERE user_id IS NOT NULL)),
      ('merchant ONRAMP',      (SELECT count(*) FROM merchant_transactions WHERE type='ONRAMP'),  (SELECT count(*) FROM merchant_onramp_transactions)),
      ('merchant OFFRAMP',     (SELECT count(*) FROM merchant_transactions WHERE type='OFFRAMP'), (SELECT count(*) FROM merchant_offramp_transactions)),
      ('merchant SWAP',        (SELECT count(*) FROM merchant_transactions WHERE type='SWAP'),    (SELECT count(*) FROM merchant_swap_transactions)),
      ('merchant VAS',         (SELECT count(*) FROM merchant_transactions WHERE type='VAS'),     (SELECT count(*) FROM vas_transactions)),
      ('merchant BRIDGE',      (SELECT count(*) FROM merchant_transactions WHERE type='BRIDGE'),  (SELECT count(*) FROM bridge_transactions WHERE user_id IS NULL AND merchant_id IS NOT NULL))
    ) AS t(label, parent_rows, detail_rows)
  LOOP
    RAISE NOTICE '% parent=% detail=%', rpad(r.label, 22), r.parent_rows, r.detail_rows;
    IF r.parent_rows < r.detail_rows THEN failures := failures || format(E'\n  %s: parent %s < detail %s', r.label, r.parent_rows, r.detail_rows); END IF;
  END LOOP;

  -- Every parent has its detail row (same id) and the same reference + status (bridge status is folded, so excluded).
  PERFORM 1;
  IF EXISTS (
    SELECT 1 FROM transactions p
    WHERE p.type <> 'BRIDGE' AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT id, reference, status FROM onramp_transactions UNION ALL SELECT id, reference, status FROM offramp_transactions
        UNION ALL SELECT id, reference, status FROM swap_transactions UNION ALL SELECT id, reference, status FROM otc_transactions
      ) d WHERE d.id = p.id AND d.reference = p.reference AND d.status = p.status)
  ) THEN failures := failures || E'\n  a user parent has no matching detail row (id/reference/status differ)'; END IF;

  IF EXISTS (
    SELECT 1 FROM merchant_transactions p
    WHERE p.type <> 'BRIDGE' AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT id, reference, status FROM merchant_onramp_transactions UNION ALL SELECT id, reference, status FROM merchant_offramp_transactions
        UNION ALL SELECT id, reference, status FROM merchant_swap_transactions UNION ALL SELECT id, reference, status FROM vas_transactions
      ) d WHERE d.id = p.id AND d.reference = p.reference AND d.status = p.status)
  ) THEN failures := failures || E'\n  a merchant parent has no matching detail row (id/reference/status differ)'; END IF;

  -- Every off-ramp that came from a swap is linked to it, and the link is mutual and shares the reference.
  IF EXISTS (SELECT 1 FROM offramp_transactions o WHERE o.swap_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM transactions a JOIN transactions b ON b.id = a.related_id AND a.id = b.related_id AND a.reference = b.reference
       WHERE a.id = o.id AND b.id = o.swap_id)) THEN
    failures := failures || E'\n  a swap/off-ramp pair (offramp_transactions.swap_id) is not linked both ways with one reference';
  END IF;

  -- A reference may repeat across types only for such linked pairs.
  IF EXISTS (SELECT 1 FROM transactions a JOIN transactions b ON b.reference = a.reference AND b.id <> a.id
             WHERE a.related_id IS DISTINCT FROM b.id) THEN
    failures := failures || E'\n  a reference is shared by two transactions that are not a linked pair';
  END IF;

  -- No id may exist in both parent tables.
  IF EXISTS (SELECT 1 FROM transactions t JOIN merchant_transactions m ON m.id = t.id) THEN
    failures := failures || E'\n  an id exists in both transactions and merchant_transactions';
  END IF;

  -- While offramp_provider_orders still exists (it is dropped by migration 20261121100000), its orders must be mirrored on legs.
  IF to_regclass('public.offramp_provider_orders') IS NOT NULL THEN
    EXECUTE $q$ SELECT
      (SELECT count(*) FROM offramp_provider_orders o WHERE COALESCE(o.offramp_transaction_id, o.merchant_offramp_transaction_id) IS NOT NULL AND lower(o.provider) IN ('bitnob','stellar'))
        > (SELECT count(*) FROM transaction_providers WHERE role='PAYOUT' AND provider='BITNOB') $q$ INTO missing_payout;
    IF missing_payout THEN failures := failures || E'\n  fewer BITNOB payout legs than offramp_provider_orders'; END IF;

    EXECUTE $q$ SELECT EXISTS (
      SELECT 1 FROM offramp_provider_orders o
      JOIN transaction_providers l ON l.transaction_id = COALESCE(o.offramp_transaction_id, o.merchant_offramp_transaction_id) AND l.role = 'PAYOUT' AND l.provider = 'BITNOB'
      WHERE l.provider_reference IS DISTINCT FROM o.provider_order_id OR l.status IS DISTINCT FROM o.provider_status
         OR l.expected_amount IS DISTINCT FROM o.expected_amount OR l.received_amount IS DISTINCT FROM o.received_amount
         OR l.outstanding_amount IS DISTINCT FROM o.outstanding_amount OR l.funding_address IS DISTINCT FROM o.funding_address
         OR l.memo IS DISTINCT FROM o.memo OR l.expires_at IS DISTINCT FROM o.expires_at OR l.deposit_tx_hash IS DISTINCT FROM o.deposit_tx_hash
         OR l.source_address IS DISTINCT FROM o.source_address OR l.payment_reference IS DISTINCT FROM o.payment_reference
         OR l.failure_reason IS DISTINCT FROM o.failure_reason OR l.failure_detail IS DISTINCT FROM o.failure_detail) $q$ INTO differs;
    IF differs THEN failures := failures || E'\n  a payout leg differs from its offramp_provider_orders row'; END IF;
  END IF;

  -- Every leg has its transaction's reference.
  IF EXISTS (SELECT 1 FROM transaction_providers l WHERE l.reference IS NULL) THEN
    failures := failures || E'\n  a transaction_providers row has no reference';
  END IF;

  -- A leg must point at an existing parent in its scope.
  IF EXISTS (SELECT 1 FROM transaction_providers l WHERE
       (l.scope = 'USER' AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = l.transaction_id))
    OR (l.scope = 'MERCHANT' AND NOT EXISTS (SELECT 1 FROM merchant_transactions m WHERE m.id = l.transaction_id))) THEN
    failures := failures || E'\n  a transaction_providers row points at a missing parent';
  END IF;

  IF failures <> '' THEN RAISE EXCEPTION 'transactions backfill verification FAILED:%', failures; END IF;
  RAISE NOTICE 'transactions backfill verification PASSED';
END $$;

-- Informational (not failures): what could not be linked, so nothing is silently lost.
SELECT 'bridge rows with no owner (skipped)' AS metric, count(*) FROM bridge_transactions WHERE user_id IS NULL AND merchant_id IS NULL
UNION ALL SELECT 'linked swap/off-ramp pairs (rows)', count(*) FROM transactions WHERE related_id IS NOT NULL
UNION ALL SELECT 'webhook_events linked to a leg', count(*) FROM webhook_events WHERE leg_id IS NOT NULL
UNION ALL SELECT 'webhook_events not linked (no/ambiguous provider)', count(*) FROM webhook_events WHERE leg_id IS NULL
UNION ALL SELECT 'webhook_events whose transaction_id has no parent', count(*) FROM webhook_events w
  WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = w.transaction_id) AND NOT EXISTS (SELECT 1 FROM merchant_transactions m WHERE m.id = w.transaction_id)
UNION ALL SELECT 'transaction_logs with MERCHANT scope', count(*) FROM transaction_logs WHERE scope = 'MERCHANT'
UNION ALL SELECT 'transaction_logs whose transaction_id has no parent', count(*) FROM transaction_logs l
  WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = l.transaction_id) AND NOT EXISTS (SELECT 1 FROM merchant_transactions m WHERE m.id = l.transaction_id)
UNION ALL SELECT 'onramp rows with deposit_account but no provider leg', count(*) FROM onramp_transactions o
  WHERE o.deposit_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM transaction_providers l WHERE l.transaction_id = o.id)
UNION ALL SELECT 'legs by provider/role: ' || provider::text || '/' || role::text, count(*) FROM transaction_providers GROUP BY provider, role;
