-- Backfill the transactions parent tables, provider legs and webhook/log links from the existing detail tables.
--
-- Run AFTER migration 20261121090000_transactions_parent_schema:   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-transactions.sql
-- IDEMPOTENT and re-runnable: every INSERT is ON CONFLICT DO NOTHING (parents by id/reference, legs by transaction+role+provider)
-- and every UPDATE only touches rows that are still unset. Detail rows are never modified. One transaction: all or nothing.
-- Re-run it (then verify) right before the code that writes parent rows goes live, to pick up rows created in between.
--
-- The parent row has the SAME id as its detail row. Mapping notes:
--   * reference is unique per TYPE, not globally: a crypto-to-fiat swap and its fiat off-ramp share one reference (98 pairs on
--     production) and are linked through related_id, set in both directions from offramp_transactions.swap_id.
--   * Bridge: owner decides the table (user_id -> transactions, else merchant_id -> merchant_transactions). Its free-text status
--     is folded into the 3 public states exactly like src/modules/bridge/bridge-status.ts. A bridge with neither owner is skipped.
--   * offramp_provider_orders.provider 'stellar' (3 demo rows from 2026-11-02, carrying Bitnob payout.* events) is mapped to BITNOB.
--   * Rows whose provider cannot be determined get no leg (they are counted by verify-transactions-backfill.sql, not guessed).
BEGIN;

-- ───────────────────────── user parents ─────────────────────────
INSERT INTO transactions (id, type, reference, user_id, status, amount, currency, network, context, created_at, updated_at, completed_at)
SELECT id, 'ONRAMP', reference, user_id, status, amount, currency, network,
       NULLIF(jsonb_strip_nulls(jsonb_build_object('ipAddress', ip_address, 'userAgent', user_agent,
              'transactionLocation', transaction_location, 'notifyUrl', notify_url)), '{}'::jsonb),
       created_at, updated_at, completed_at
FROM onramp_transactions
ON CONFLICT DO NOTHING;

INSERT INTO transactions (id, type, reference, user_id, status, amount, currency, network, context, destination, created_at, updated_at, completed_at)
SELECT id, 'OFFRAMP', reference, user_id, status, amount, currency, network,
       NULLIF(jsonb_strip_nulls(jsonb_build_object('ipAddress', ip_address, 'userAgent', user_agent, 'notifyUrl', notify_url)), '{}'::jsonb),
       NULLIF(jsonb_strip_nulls(jsonb_build_object('bankCode', bank_code, 'accountNumber', account_number,
              'accountName', account_name, 'bankName', bank_name)), '{}'::jsonb),
       created_at, updated_at, completed_at
FROM offramp_transactions
ON CONFLICT DO NOTHING;

INSERT INTO transactions (id, type, reference, user_id, status, amount, currency, created_at, updated_at, completed_at)
SELECT id, 'SWAP', reference, user_id, status, from_amount, from_token_type, created_at, updated_at, completed_at
FROM swap_transactions
ON CONFLICT DO NOTHING;

INSERT INTO transactions (id, type, reference, user_id, status, amount, network, created_at, updated_at, completed_at)
SELECT id, 'OTC', reference, user_id, status, amount, network, created_at, updated_at, completed_at
FROM otc_transactions
ON CONFLICT DO NOTHING;

INSERT INTO transactions (id, type, reference, user_id, status, amount, network, context, created_at, updated_at)
SELECT id, 'BRIDGE', reference, user_id,
       CASE upper(status)
         WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'SUCCESS' THEN 'COMPLETED'
         WHEN 'FAILED' THEN 'FAILED' WHEN 'REJECTED' THEN 'FAILED' WHEN 'REVERSED' THEN 'FAILED' WHEN 'EXPIRED' THEN 'FAILED'
         WHEN 'CANCELLED' THEN 'FAILED' WHEN 'REFUNDED' THEN 'FAILED'
         ELSE 'PENDING' END::"TransactionStatus",
       CASE WHEN amount ~ '^[0-9]+(\.[0-9]+)?$' THEN amount::numeric END,
       from_chain, jsonb_build_object('toChain', to_chain), created_at, updated_at
FROM bridge_transactions
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ───────────────────────── merchant parents ─────────────────────────
INSERT INTO merchant_transactions (id, type, reference, merchant_id, status, amount, currency, network, created_at, updated_at, completed_at)
SELECT id, 'ONRAMP', reference, merchant_id, status, amount, currency, network, created_at, updated_at, completed_at
FROM merchant_onramp_transactions
ON CONFLICT DO NOTHING;

INSERT INTO merchant_transactions (id, type, reference, merchant_id, status, amount, currency, network, destination, created_at, updated_at, completed_at)
SELECT id, 'OFFRAMP', reference, merchant_id, status, amount, currency, network,
       NULLIF(jsonb_strip_nulls(jsonb_build_object('bankCode', bank_code, 'accountNumber', account_number,
              'accountName', account_name, 'bankName', bank_name)), '{}'::jsonb),
       created_at, updated_at, completed_at
FROM merchant_offramp_transactions
ON CONFLICT DO NOTHING;

INSERT INTO merchant_transactions (id, type, reference, merchant_id, status, amount, currency, created_at, updated_at, completed_at)
SELECT id, 'SWAP', reference, merchant_id, status, from_amount, from_token_type, created_at, updated_at, completed_at
FROM merchant_swap_transactions
ON CONFLICT DO NOTHING;

INSERT INTO merchant_transactions (id, type, reference, merchant_id, status, amount, currency, created_at, updated_at, completed_at)
SELECT id, 'VAS', reference, merchant_id, status, amount, currency, created_at, updated_at, completed_at
FROM vas_transactions
ON CONFLICT DO NOTHING;

INSERT INTO merchant_transactions (id, type, reference, merchant_id, status, amount, network, context, created_at, updated_at)
SELECT id, 'BRIDGE', reference, merchant_id,
       CASE upper(status)
         WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'SUCCESS' THEN 'COMPLETED'
         WHEN 'FAILED' THEN 'FAILED' WHEN 'REJECTED' THEN 'FAILED' WHEN 'REVERSED' THEN 'FAILED' WHEN 'EXPIRED' THEN 'FAILED'
         WHEN 'CANCELLED' THEN 'FAILED' WHEN 'REFUNDED' THEN 'FAILED'
         ELSE 'PENDING' END::"TransactionStatus",
       CASE WHEN amount ~ '^[0-9]+(\.[0-9]+)?$' THEN amount::numeric END,
       from_chain, jsonb_build_object('toChain', to_chain), created_at, updated_at
FROM bridge_transactions
WHERE user_id IS NULL AND merchant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Swap <-> off-ramp pairs (same reference, linked by offramp_transactions.swap_id), both directions.
UPDATE transactions p SET related_id = o.swap_id
FROM offramp_transactions o
WHERE o.id = p.id AND o.swap_id IS NOT NULL AND p.related_id IS NULL
  AND EXISTS (SELECT 1 FROM transactions s WHERE s.id = o.swap_id);
UPDATE transactions p SET related_id = o.id
FROM offramp_transactions o
WHERE o.swap_id = p.id AND p.related_id IS NULL
  AND EXISTS (SELECT 1 FROM transactions x WHERE x.id = o.id);

-- ───────────────────────── provider legs ─────────────────────────
-- On-ramp funding: Flint (with its deposit account), Safehaven, Pulse MFB.
INSERT INTO transaction_providers (id, transaction_id, scope, role, provider, provider_reference, details, last_event_at, updated_at)
SELECT gen_random_uuid(), id, 'USER', 'FUNDING', 'FLINT', flint_transaction_id,
       jsonb_strip_nulls(jsonb_build_object('depositAccount', deposit_account)), updated_at, updated_at
FROM onramp_transactions WHERE flint_transaction_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO transaction_providers (id, transaction_id, scope, role, provider, details, last_event_at, updated_at)
SELECT gen_random_uuid(), id, 'USER', 'FUNDING', 'SAFEHAVEN', safehaven_account, updated_at, updated_at
FROM onramp_transactions WHERE safehaven_account IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO transaction_providers (id, transaction_id, scope, role, provider, details, last_event_at, updated_at)
SELECT gen_random_uuid(), id, 'USER', 'FUNDING', 'PULSE_MFB', pulse_mfb_account, updated_at, updated_at
FROM onramp_transactions WHERE pulse_mfb_account IS NOT NULL
ON CONFLICT DO NOTHING;

-- Off-ramp (legacy provider columns on the detail row).
INSERT INTO transaction_providers (id, transaction_id, scope, role, provider, provider_reference, last_event_at, updated_at)
SELECT gen_random_uuid(), id, 'USER', 'PAYOUT', 'FLINT', flint_transaction_id, updated_at, updated_at
FROM offramp_transactions WHERE flint_transaction_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO transaction_providers (id, transaction_id, scope, role, provider, details, last_event_at, updated_at)
SELECT gen_random_uuid(), id, 'USER', 'SETTLEMENT', 'SAFEHAVEN', safehaven_account, updated_at, updated_at
FROM offramp_transactions WHERE safehaven_account IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO transaction_providers (id, transaction_id, scope, role, provider, details, last_event_at, updated_at)
SELECT gen_random_uuid(), id, 'USER', 'SETTLEMENT', 'PULSE_MFB', pulse_mfb_account, updated_at, updated_at
FROM offramp_transactions WHERE pulse_mfb_account IS NOT NULL
ON CONFLICT DO NOTHING;

-- Off-ramp payout order (Bitnob) and its CCTP bridge leg: the sync trigger on offramp_provider_orders builds both legs, so
-- touching every row fires it. This is the same code path that keeps the legs current afterwards, so backfill and live sync can't drift.
DO $$ BEGIN
  IF to_regclass('public.offramp_provider_orders') IS NOT NULL THEN
    UPDATE offramp_provider_orders SET provider = provider;
  END IF; -- the table is dropped by migration 20261121100000; its data is already on the legs then
END $$;

-- A standalone bridge transaction is itself a CCTP leg.
INSERT INTO transaction_providers (id, transaction_id, scope, role, provider, provider_reference, status, details, last_event_at, updated_at)
SELECT gen_random_uuid(), id,
       CASE WHEN user_id IS NOT NULL THEN 'USER' ELSE 'MERCHANT' END::"LedgerScope",
       'BRIDGE', 'CCTP', transaction_hash, status,
       jsonb_strip_nulls(jsonb_build_object('fromChain', from_chain, 'toChain', to_chain, 'offrampReference', offramp_reference)),
       updated_at, updated_at
FROM bridge_transactions
WHERE user_id IS NOT NULL OR merchant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ───────────────────────── links ─────────────────────────
-- Every leg carries its transaction's reference (the trigger already sets it for payout/bridge legs of provider orders).
UPDATE transaction_providers l SET reference = t.reference FROM transactions t WHERE l.reference IS NULL AND l.scope = 'USER' AND t.id = l.transaction_id;
UPDATE transaction_providers l SET reference = t.reference FROM merchant_transactions t WHERE l.reference IS NULL AND l.scope = 'MERCHANT' AND t.id = l.transaction_id;

-- A webhook event joins a leg only when exactly one leg of that transaction belongs to its provider (never guess).
UPDATE webhook_events we
SET leg_id = m.leg_id
FROM (
  SELECT transaction_id, provider, (array_agg(id))[1] AS leg_id, count(*) AS n
  FROM transaction_providers GROUP BY transaction_id, provider
) m
WHERE we.leg_id IS NULL
  AND m.n = 1
  AND m.transaction_id = we.transaction_id
  AND m.provider::text = CASE lower(we.provider) WHEN 'pulse' THEN 'PULSE_MFB' ELSE upper(we.provider) END;

-- Log rows for merchant transactions are scoped MERCHANT (everything else keeps the USER default).
UPDATE transaction_logs
SET scope = 'MERCHANT'
WHERE scope = 'USER' AND transaction_id IN (SELECT id FROM merchant_transactions);

COMMIT;
