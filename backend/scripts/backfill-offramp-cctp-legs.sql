-- Record the CCTP leg for off-ramps that were funded over the relay before relays were recorded (metadata.cctpRelay, no CCTP leg).
-- IDEMPOTENT: one leg per (transaction, role, provider); existing legs are left alone. Detail rows are never modified. One transaction.
-- Mirrors src/modules/ramp/cctp-relay-leg.ts (relayLegFields).
BEGIN;

INSERT INTO transaction_providers
  (id, transaction_id, scope, reference, role, provider, provider_reference, status, deposit_tx_hash, funding_address,
   failed_step, failure_reason, details, last_event_at, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'USER', o.reference, 'BRIDGE', 'CCTP',
       COALESCE(o.metadata->>'stellarTxHash', o.metadata->'cctpRelay'->>'burnTxHash'),
       UPPER(COALESCE(o.metadata->'cctpRelay'->>'status', 'awaiting_burn')),
       o.metadata->'cctpRelay'->>'mintTxHash',
       o.metadata->'cctpRelay'->>'mintRecipient',
       CASE WHEN LOWER(o.metadata->'cctpRelay'->>'status') = 'rejected' THEN 'attestation' END,
       CASE WHEN LOWER(o.metadata->'cctpRelay'->>'status') = 'rejected' THEN COALESCE(o.metadata->'cctpRelay'->>'error', 'Rejected') END,
       jsonb_build_object(
         'kind', 'offramp_relay',
         'network', o.metadata->'cctpRelay'->>'network',
         'sourceChain', 'stellar',
         'destinationChain', COALESCE(o.metadata->'cctpRelay'->>'destinationChain', 'base'),
         'burnTxHash', COALESCE(o.metadata->>'stellarTxHash', o.metadata->'cctpRelay'->>'burnTxHash'),
         'mintTxHash', o.metadata->'cctpRelay'->>'mintTxHash',
         'burnAmountUnits', o.metadata->'cctpRelay'->>'burnAmountUnits',
         'maxFeeUnits', o.metadata->'cctpRelay'->>'maxFeeUnits',
         'claimedAt', o.metadata->'cctpRelay'->>'claimedAt',
         'mintedAt', o.metadata->'cctpRelay'->>'mintedAt',
         'mintedBy', o.metadata->'cctpRelay'->>'mintedBy'),
       COALESCE((o.metadata->'cctpRelay'->>'mintedAt')::timestamp, o.updated_at), o.created_at, now()
FROM offramp_transactions o
WHERE o.metadata ? 'cctpRelay'
ON CONFLICT (transaction_id, role, provider) DO NOTHING;

COMMIT;

-- Check: every relayed off-ramp now has a CCTP leg.
SELECT count(*) AS relayed_offramps,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM transaction_providers l WHERE l.transaction_id = o.id AND l.provider = 'CCTP')) AS with_cctp_leg
FROM offramp_transactions o WHERE o.metadata ? 'cctpRelay';
