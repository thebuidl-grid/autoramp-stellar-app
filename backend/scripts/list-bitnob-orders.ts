/**
 * Read-only view of Bitnob-related orders: our on-/off-ramp orders (DB) and, with --remote, what Bitnob itself
 * holds (payouts + trading orders).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/list-bitnob-orders.ts                 # last 24h, DB only
 *   npx ts-node -r tsconfig-paths/register scripts/list-bitnob-orders.ts --hours 72
 *   npx ts-node -r tsconfig-paths/register scripts/list-bitnob-orders.ts --needs-review  # only stuck/flagged
 *   npx ts-node -r tsconfig-paths/register scripts/list-bitnob-orders.ts --remote        # also query Bitnob
 *
 * Never writes anything and never prints secrets.
 */
import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { buildBitnobAuthHeaders } from '../src/modules/bitnob/bitnob.service';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const hoursArg = args.indexOf('--hours');
const HOURS = hoursArg >= 0 ? Number(args[hoursArg + 1]) || 24 : 24;
const NEEDS_REVIEW = flag('needs-review');
const REMOTE = flag('remote');

const prisma = new PrismaClient();
const pad = (v: unknown, n: number) => String(v ?? '-').slice(0, n).padEnd(n);
const when = (d: Date) => d.toISOString().replace('T', ' ').slice(5, 19);

async function local() {
  const since = new Date(Date.now() - HOURS * 3600 * 1000);
  const onramps = await prisma.onrampTransaction.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } });
  const offramps = await prisma.offrampTransaction.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    include: { providerOrder: true },
  });

  console.log(`\n== ON-RAMPS (last ${HOURS}h) ==`);
  console.log(pad('created', 15), pad('reference', 24), pad('status', 11), pad('amount', 8), pad('net', 8), pad('SH account', 11), 'notes');
  for (const o of onramps as any[]) {
    const sh = o.metadata?.safehaven ?? {};
    const notes = [
      sh.needsReview && 'NEEDS REVIEW',
      (o.metadata?.failureReason || sh.settlementError) && `err: ${o.metadata?.failureReason || sh.settlementError}`,
      o.metadata?.bitnobWithdrawal && 'usdc-withdrawal-started',
      o.metadata?.refund && 'refunded',
    ].filter(Boolean).join(' | ');
    if (NEEDS_REVIEW && !sh.needsReview && o.status !== 'FAILED') continue;
    console.log(pad(when(o.createdAt), 15), pad(o.reference, 24), pad(o.status, 11), pad(o.amount, 8), pad(o.network, 8), pad(sh.accountNumber, 11), notes);
  }

  console.log(`\n== OFF-RAMPS (last ${HOURS}h) ==`);
  console.log(pad('created', 15), pad('reference', 24), pad('status', 17), pad('amount', 10), pad('net', 8), pad('bitnob payout', 14), 'notes');
  for (const o of offramps as any[]) {
    const sh = o.metadata?.safehaven ?? {};
    const failed = ['FAILED', 'REJECTED', 'EXPIRED', 'PARTIALLY_SETTLED'].includes(o.status);
    if (NEEDS_REVIEW && !sh.needsReview && !failed) continue;
    const notes = [sh.needsReview && 'NEEDS REVIEW', sh.forwardError && `err: ${sh.forwardError}`, o.providerOrder?.providerStatus && `bitnob: ${o.providerOrder.providerStatus}`]
      .filter(Boolean).join(' | ');
    console.log(pad(when(o.createdAt), 15), pad(o.reference, 24), pad(o.status, 17), pad(o.amount, 10), pad(o.network, 8), pad(o.providerOrder?.providerOrderId, 14), notes);
  }
}

async function remote() {
  const clientId = process.env.BITNOB_CLIENT_ID?.trim();
  const key = (process.env.BITNOB_KEY || process.env.BITNOB_API_KEY)?.trim();
  const base = (process.env.BITNOB_API_URL || 'https://api.bitnob.com').replace(/\/+$/, '');
  if (!clientId || !key) return console.log('\n(remote skipped: BITNOB_CLIENT_ID / BITNOB_KEY not set)');
  const get = async (path: string) => {
    const res = await axios.get(`${base}${path}`, { headers: buildBitnobAuthHeaders(clientId, key, undefined), timeout: 30000 });
    const d = res.data?.data ?? res.data;
    return Array.isArray(d) ? d : (d?.items ?? d?.payouts ?? d?.orders ?? d?.data ?? []);
  };
  const show = (title: string, rows: any[], pick: (r: any) => unknown[]) => {
    console.log(`\n== ${title} (${rows.length}) ==`);
    for (const r of rows) console.log(pick(r).map((v, i) => pad(v, [20, 16, 12, 12, 30][i] ?? 20)).join(' '));
  };
  try {
    const payouts = (await get('/api/payouts?limit=50&sort_field=created_at&sort_direction=desc')).filter((p: any) => !String(p.reference).startsWith('rate-'));
    show('BITNOB PAYOUTS (rate probes hidden)', payouts, (p) => [p.created_at, p.status, `${p.from_asset}->${p.to_currency}`, p.settlement_amount, p.reference]);
  } catch (e: any) {
    console.log('\nBitnob payouts failed:', e?.response?.status, JSON.stringify(e?.response?.data ?? e.message).slice(0, 200));
  }
  try {
    const orders = await get('/api/trading/orders');
    show('BITNOB TRADING ORDERS', orders, (o) => [o.created_at, o.status, `${o.base_currency}/${o.quote_currency}`, o.quantity, o.reference]);
  } catch (e: any) {
    console.log('\nBitnob trading orders failed:', e?.response?.status, JSON.stringify(e?.response?.data ?? e.message).slice(0, 200));
  }
}

(async () => {
  await local();
  if (REMOTE) await remote();
})()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
