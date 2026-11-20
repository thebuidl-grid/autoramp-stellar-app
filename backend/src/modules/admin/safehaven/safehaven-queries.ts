/**
 * Read-only SQL for the admin Safehaven and CCTP pages. Kept as plain strings built from fixed fragments so they can be tested against a
 * real database, and so no user input is ever concatenated: every value goes in as a bound parameter.
 */

/** Events we could not tie to a transaction carry the all-zero UUID rather than NULL. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const UNMATCHED = `(w.transaction_id IS NULL OR w.transaction_id = '${NIL_UUID}')`;

/** Safehaven names the account in the event payload (credit or debit side), not in the reference column. */
export const EVENT_CREDIT = `COALESCE(w.payload->'data'->>'creditAccountNumber', w.payload->>'creditAccountNumber')`;
export const EVENT_DEBIT = `COALESCE(w.payload->'data'->>'debitAccountNumber', w.payload->>'debitAccountNumber')`;

export type AccountKind = 'virtual' | 'user_deposit' | 'merchant_sub' | 'merchant_main';
export const ACCOUNT_KINDS: AccountKind[] = ['virtual', 'user_deposit', 'merchant_sub', 'merchant_main'];

/** What the `kind` filter accepts: one kind, or a group. */
export const ACCOUNT_FILTERS = [...ACCOUNT_KINDS, 'customer', 'merchant'] as const;

/** The kinds a filter value stands for. Null means no filter. */
export function kindsFor(filter?: string | null): AccountKind[] | null {
  if (!filter) return null;
  if (filter === 'customer') return ['virtual', 'user_deposit'];
  if (filter === 'merchant') return ['merchant_sub', 'merchant_main'];
  return (ACCOUNT_KINDS as string[]).includes(filter) ? [filter as AccountKind] : null;
}

/**
 * Every Safehaven account we know of, one row each, from the four places they live:
 *  - virtual_accounts: accounts created for a payer (user or merchant);
 *  - the deposit account stored on each on-ramp (the source of truth for user NGN payments) when no virtual_accounts row covers it;
 *  - merchant sub-accounts and merchant main accounts.
 */
export const ACCOUNTS_CTE = `
accounts AS (
  SELECT 'virtual'::text AS kind, v.account_number, v.account_name, v.bank_name, v.bank_code, v.status::text AS status,
         v.user_id::text AS user_id, v.merchant_id::text AS merchant_id, v.transaction_id::text AS transaction_id,
         v.transaction_type, v.expires_at, v.created_at
  FROM virtual_accounts v
  UNION ALL
  (SELECT DISTINCT ON (o.deposit_account->>'accountNumber')
         'user_deposit', o.deposit_account->>'accountNumber', o.deposit_account->>'accountName', o.deposit_account->>'bankName',
         o.deposit_account->>'bankCode', NULL, o.user_id::text, NULL, o.id::text, 'onramp', NULL::timestamp, o.created_at
  FROM onramp_transactions o
  WHERE o.deposit_account->>'accountNumber' IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM virtual_accounts v WHERE v.account_number = o.deposit_account->>'accountNumber')
  ORDER BY o.deposit_account->>'accountNumber', o.created_at DESC)
  UNION ALL
  SELECT 'merchant_sub', s.account_number, s.account_name, s.bank_name, s.bank_code, NULL, NULL, s.merchant_id::text, NULL, NULL, NULL, s.created_at
  FROM merchant_sub_accounts s
  UNION ALL
  SELECT 'merchant_main', m.account_number, m.account_name, m.bank_name, m.bank_code, NULL, NULL, m.merchant_id::text, NULL, NULL, NULL, m.created_at
  FROM merchant_bank_accounts m
)`;

/** Events per account: how many, the most recent, and how many we could not match to a transaction. */
export const ACTIVITY_CTE = `
activity AS (
  SELECT acct, COUNT(*) AS events, MAX(created_at) AS last_event_at, COUNT(*) FILTER (WHERE unmatched) AS unmatched
  FROM (
    SELECT ${EVENT_CREDIT} AS acct, w.created_at, ${UNMATCHED} AS unmatched FROM webhook_events w WHERE w.provider = 'safehaven'
    UNION ALL
    SELECT ${EVENT_DEBIT} AS acct, w.created_at, ${UNMATCHED} AS unmatched FROM webhook_events w WHERE w.provider = 'safehaven'
  ) e
  WHERE acct IS NOT NULL
  GROUP BY acct
)`;

export const ACCOUNTS_SQL = `
WITH ${ACCOUNTS_CTE}, ${ACTIVITY_CTE}
SELECT a.kind, a.account_number AS "accountNumber", a.account_name AS "accountName", a.bank_name AS "bankName", a.bank_code AS "bankCode",
       a.status, a.user_id AS "userId", u.email AS "userEmail", a.merchant_id AS "merchantId", mer.name AS "merchantName",
       a.transaction_id AS "transactionId", a.transaction_type AS "transactionType", a.expires_at AS "expiresAt", a.created_at AS "createdAt",
       COALESCE(ac.events, 0)::int AS events, ac.last_event_at AS "lastEventAt", COALESCE(ac.unmatched, 0)::int AS unmatched,
       COUNT(*) OVER ()::int AS total
FROM accounts a
LEFT JOIN activity ac ON ac.acct = a.account_number
LEFT JOIN users u ON u.id::text = a.user_id
LEFT JOIN merchants mer ON mer.id::text = a.merchant_id
WHERE ($1::text[] IS NULL OR a.kind = ANY($1::text[]))
  AND ($2::text IS NULL OR a.account_number ILIKE $2 OR a.account_name ILIKE $2 OR u.email ILIKE $2 OR mer.name ILIKE $2)
ORDER BY COALESCE(ac.last_event_at, a.created_at) DESC NULLS LAST
LIMIT $3 OFFSET $4`;

/** Safehaven events as transactions: money in and out, with both sides, who we tied it to, and whether we could. */
export const TRANSACTIONS_SQL = `
SELECT w.id, w.event_type AS "eventType", w.status, w.processed, w.error_message AS "errorMessage", w.created_at AS "createdAt",
       w.transaction_type AS "transactionType", CASE WHEN ${UNMATCHED} THEN NULL ELSE w.transaction_id END AS "transactionId", w.reference,
       COALESCE(w.payload->'data'->>'amount', w.payload->>'amount') AS amount,
       ${EVENT_CREDIT} AS "creditAccountNumber", COALESCE(w.payload->'data'->>'creditAccountName', w.payload->>'creditAccountName') AS "creditAccountName",
       ${EVENT_DEBIT} AS "debitAccountNumber", COALESCE(w.payload->'data'->>'debitAccountName', w.payload->>'debitAccountName') AS "debitAccountName",
       COALESCE(w.payload->'data'->>'sessionId', w.payload->>'sessionId') AS "sessionId",
       COALESCE(w.payload->'data'->>'paymentReference', w.payload->>'paymentReference') AS "paymentReference",
       COALESCE(w.payload->'data'->>'externalReference', w.payload->>'externalReference') AS "externalReference",
       COALESCE(t.reference, mt.reference) AS "ourReference",
       COUNT(*) OVER ()::int AS total
FROM webhook_events w
LEFT JOIN transactions t ON t.id = w.transaction_id AND NOT ${UNMATCHED}
LEFT JOIN merchant_transactions mt ON mt.id = w.transaction_id AND NOT ${UNMATCHED}
WHERE w.provider = 'safehaven'
  AND ($1::text IS NULL OR w.status ILIKE $1)
  AND ($2::boolean IS NULL OR (NOT ${UNMATCHED}) = $2)
  AND ($3::text IS NULL OR w.reference ILIKE $3 OR ${EVENT_CREDIT} ILIKE $3 OR ${EVENT_DEBIT} ILIKE $3
       OR COALESCE(w.payload->'data'->>'sessionId', w.payload->>'sessionId') ILIKE $3
       OR COALESCE(w.payload->'data'->>'paymentReference', w.payload->>'paymentReference') ILIKE $3)
ORDER BY w.created_at DESC
LIMIT $4 OFFSET $5`;

/** One account's events (credit or debit side), newest first. */
export const ACCOUNT_EVENTS_SQL = `
SELECT w.id, w.event_type AS "eventType", w.status, w.processed, w.error_message AS "errorMessage", w.created_at AS "createdAt",
       CASE WHEN ${UNMATCHED} THEN NULL ELSE w.transaction_id END AS "transactionId", w.reference,
       COALESCE(w.payload->'data'->>'amount', w.payload->>'amount') AS amount,
       ${EVENT_CREDIT} AS "creditAccountNumber", ${EVENT_DEBIT} AS "debitAccountNumber"
FROM webhook_events w
WHERE w.provider = 'safehaven' AND (${EVENT_CREDIT} = $1 OR ${EVENT_DEBIT} = $1)
ORDER BY w.created_at DESC
LIMIT 100`;

/**
 * Every CCTP transfer: bridge transfers (a user moving USDC between chains) and off-ramps funded over the relay (Stellar burn, Base mint).
 * Relayed off-ramps are recorded as a CCTP leg on the off-ramp transaction; `kind` says which is which. Amounts are in USDC micro-units.
 */
export const CCTP_SQL = `
WITH transfers AS (
  SELECT 'bridge'::text AS kind, b.id::text AS id, b.reference, b.from_chain AS "fromChain", b.to_chain AS "toChain", b.amount,
         b.status, b.transaction_hash AS "burnTxHash", b.source_address AS "sourceAddress", b.destination_address AS "destinationAddress",
         b.offramp_reference AS "offrampReference", b.chain_network AS "chainNetwork", b.created_at AS "createdAt", b.updated_at AS "updatedAt",
         b.user_id::text AS "userId", b.merchant_id::text AS "merchantId",
         l.status AS "legStatus", l.provider_reference AS "legReference", l.failed_step AS "failedStep", l.failure_reason AS "failureReason",
         l.last_event_at AS "lastEventAt", l.details AS "legDetails"
  FROM bridge_transactions b
  LEFT JOIN transaction_providers l ON l.transaction_id = b.id AND l.provider = 'CCTP'
  UNION ALL
  SELECT 'offramp_relay', o.id::text, o.reference,
         CASE WHEN l.details->>'network' = 'testnet' THEN 'Stellar_Testnet' ELSE 'Stellar' END,
         CASE WHEN l.details->>'network' = 'testnet' THEN 'Base_Sepolia' ELSE 'Base' END,
         COALESCE(l.details->>'burnAmountUnits', ''),
         CASE UPPER(l.status) WHEN 'MINTED' THEN 'COMPLETED' WHEN 'REJECTED' THEN 'FAILED' WHEN 'AWAITING_BURN' THEN 'PENDING' ELSE 'PROCESSING' END,
         l.provider_reference, '', COALESCE(l.funding_address, ''), o.reference, o.chain_network, o.created_at, o.updated_at,
         o.user_id::text, NULL,
         l.status, l.deposit_tx_hash, l.failed_step, l.failure_reason, l.last_event_at, l.details
  FROM transaction_providers l
  JOIN offramp_transactions o ON o.id = l.transaction_id
  WHERE l.provider = 'CCTP' AND l.details->>'kind' = 'offramp_relay'
)
SELECT t.*, u.email AS "userEmail", mer.name AS "merchantName", COUNT(*) OVER ()::int AS total
FROM transfers t
LEFT JOIN users u ON u.id::text = t."userId"
LEFT JOIN merchants mer ON mer.id::text = t."merchantId"
WHERE ($1::text IS NULL OR t.status ILIKE $1)
  AND ($2::text IS NULL OR t.reference ILIKE $2 OR t."burnTxHash" ILIKE $2 OR t."sourceAddress" ILIKE $2 OR t."destinationAddress" ILIKE $2
       OR t."offrampReference" ILIKE $2 OR t."legReference" ILIKE $2 OR u.email ILIKE $2)
ORDER BY t."createdAt" DESC
LIMIT $3 OFFSET $4`;
