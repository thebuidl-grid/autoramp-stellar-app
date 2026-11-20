/**
 * Refund an NGN on-ramp order to the account that paid it, from the SafeHaven main account.
 *
 * Use when a payment landed in an order's SafeHaven deposit account but the order could not be settled
 * (no USDC was sent). Dry-run by default; pass --apply to actually send the money.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/refund-onramp-to-sender.ts <orderReference>
 *   npx ts-node -r tsconfig-paths/register scripts/refund-onramp-to-sender.ts <orderReference> --apply
 *
 * Safety checks (refuses if any fail): order exists and has no prior refund; no USDC withdrawal was started;
 * the payer is read from the inbound SafeHaven `virtualAccount.transfer` webhook (never typed in); the payer's
 * bank is taken from the NIP session id and the account name must match via name enquiry; the main account
 * balance covers the amount. Uses a fixed paymentReference (REFUND-<order>) so a retry cannot double-pay.
 */
import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const [reference] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
if (!reference) {
  console.error('Usage: refund-onramp-to-sender.ts <orderReference> [--apply]');
  process.exit(1);
}

const base = process.env.SAFEHAVEN_BASE_URL;
const clientId = process.env.SAFEHAVEN_CLIENT_ID;
const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID;
const mainAccount = process.env.SAFEHAVEN_DEBIT_ACCOUNT_NUMBER;
if (!base || !clientId || !ibsClientId || !mainAccount) {
  console.error('Missing SAFEHAVEN_BASE_URL / SAFEHAVEN_CLIENT_ID / SAFEHAVEN_IBS_CLIENT_ID / SAFEHAVEN_DEBIT_ACCOUNT_NUMBER');
  process.exit(1);
}

const prisma = new PrismaClient();
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();

async function main() {
  const order: any = await prisma.onrampTransaction.findFirst({ where: { reference } });
  if (!order) throw new Error(`Order ${reference} not found`);
  const meta = (order.metadata ?? {}) as any;
  if (meta.refund) throw new Error(`Already refunded: ${JSON.stringify(meta.refund)}`);
  if (meta.bitnobWithdrawal) throw new Error('A USDC withdrawal was already started for this order; refusing to refund');
  const vaNumber = meta.safehaven?.accountNumber;
  if (!vaNumber) throw new Error('Order has no SafeHaven deposit account');

  // The payer: the inbound credit to the order's virtual account (not our own funding/sweep transfers).
  const hooks = await prisma.inboundWebhook.findMany({
    where: { provider: 'safehaven', receivedAt: { gte: new Date(order.createdAt) } },
    orderBy: { receivedAt: 'asc' },
  });
  const inbound = hooks
    .map((h: any) => h.payload)
    .filter((p: any) => (p?.eventType || p?.type) === 'virtualAccount.transfer')
    .map((p: any) => p.data)
    .find(
      (d: any) =>
        d?.creditAccountNumber === vaNumber &&
        String(d?.status).toLowerCase() === 'completed' &&
        String(d?.debitAccountNumber) !== mainAccount,
    );
  if (!inbound) throw new Error('No completed inbound payment found for this order');

  const amount = Number(inbound.amount);
  const payerAccount = String(inbound.debitAccountNumber);
  const payerName = String(inbound.debitAccountName);
  const bankCode = String(inbound.sessionId).slice(0, 6); // NIP session ids start with the originating institution code
  if (!(amount > 0) || !/^\d{6}$/.test(bankCode)) throw new Error('Could not determine amount or payer bank');

  const token = (
    await axios.post(`${base}/oauth2/token`, {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_assertion: ibsClientId,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    })
  ).data.access_token;
  const headers = { Authorization: `Bearer ${token}`, ClientID: ibsClientId!, 'Content-Type': 'application/json' };

  const accounts = (await axios.get(`${base}/accounts`, { params: { page: 0, limit: 100, isSubAccount: false }, headers })).data?.data ?? [];
  const main = accounts.find((a: any) => String(a.accountNumber) === mainAccount);
  const balance = Number(main?.accountBalance);
  if (!(balance >= amount)) throw new Error(`Main account balance ${balance} does not cover ${amount}`);

  const ne = (await axios.post(`${base}/transfers/name-enquiry`, { bankCode, accountNumber: payerAccount }, { headers })).data?.data;
  if (!ne?.sessionId || norm(ne.accountName) !== norm(payerName)) {
    throw new Error(`Name enquiry mismatch: payer "${payerName}" vs bank "${ne?.accountName}"`);
  }

  const paymentReference = `REFUND-${reference}`;
  console.log(
    JSON.stringify({ order: reference, amount, to: `${bankCode}/${payerAccount}`, name: ne.accountName, mainBalance: balance, paymentReference, mode: APPLY ? 'APPLY' : 'DRY-RUN' }, null, 2),
  );
  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to send the money.');
    return;
  }

  const res = (
    await axios.post(
      `${base}/transfers`,
      {
        nameEnquiryReference: ne.sessionId,
        beneficiaryBankCode: bankCode,
        beneficiaryAccountNumber: payerAccount,
        amount,
        saveBeneficiary: false,
        narration: `Autoramp refund ${reference}`,
        debitAccountNumber: mainAccount,
        paymentReference,
      },
      { headers },
    )
  ).data;
  console.log('Transfer response:', JSON.stringify({ statusCode: res.statusCode, responseCode: res.responseCode, message: res.message, status: res.data?.status }));
  const ok = !(res.statusCode >= 400) && (!res.responseCode || res.responseCode === '00');
  if (!ok) throw new Error('Transfer was not accepted; order left unchanged');

  await prisma.onrampTransaction.update({
    where: { id: order.id },
    data: {
      status: 'REFUNDED',
      metadata: {
        ...meta,
        refund: { paymentReference, amount, to: `${bankCode}/${payerAccount}`, at: new Date().toISOString(), reason: 'Paid but not settled (no USDC sent); refunded to sender' },
      },
    },
  });
  console.log('Order marked REFUNDED.');
}

main()
  .catch((e) => {
    console.error('ERROR:', e?.response?.data ? JSON.stringify(e.response.data) : e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
