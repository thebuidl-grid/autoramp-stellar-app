import { PrismaClient } from '@prisma/client';
import { program } from 'commander';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

/**
 * Backfills missing provider references on merchant_bank_transfers.
 *
 * Background: merchant-bank.service.transfer() used to read the SafeHaven
 * reference from `res.reference`, but SafeHaven returns
 * `{ data: { _id, sessionId, paymentReference, status } }` — so every row
 * created before the fix was stored with safehavenReference = NULL even
 * when the provider accepted the transfer. This script re-correlates those
 * orphaned rows by matching amount + beneficiary + timestamp against the
 * provider's transfer list, then stores the provider sessionId.
 *
 * Matching is strict (exact amount + exact beneficiary account, provider
 * timestamp within --tolerance-minutes). Ambiguous or unmatched rows are
 * only reported, never updated.
 *
 * Usage:
 *   npx ts-node scripts/backfill-transfer-references.ts            # dry run
 *   npx ts-node scripts/backfill-transfer-references.ts --apply    # write to DB
 */

async function getAccessToken(
  baseUrl: string,
  clientId: string,
  ibsClientId: string,
): Promise<string> {
  const response = await axios.post(
    `${baseUrl}/oauth2/token`,
    {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_assertion: ibsClientId,
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    },
    {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30000,
    },
  );
  return response.data.access_token;
}

function toNumber(v: unknown): number {
  if (v !== null && typeof v === 'object' && 'toNumber' in (v as any)) {
    return (v as any).toNumber();
  }
  return Number(v);
}

function dateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function mapProviderStatus(status: unknown): 'COMPLETED' | 'FAILED' | null {
  const s = String(status ?? '').toLowerCase();
  if (['completed', 'success', 'successful', 'approved'].includes(s)) return 'COMPLETED';
  if (['failed', 'rejected', 'declined', 'reversed'].includes(s)) return 'FAILED';
  return null;
}

interface TransferRow {
  id: string;
  merchantId: string;
  reference: string;
  status: string;
  amount: any;
  currency: string;
  beneficiaryAccountNumber: string;
  beneficiaryBankCode: string;
  debitAccountNumber: string;
  narration: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: any;
  merchant: {
    bankAccount: {
      accountNumber?: string;
      fiatProvider?: string;
      metadata?: any;
    } | null;
  } | null;
}

async function main() {
  program
    .version('1.0.0')
    .description(
      'Backfill missing safehavenReference on merchant bank transfers by matching against the provider transfer list',
    )
    .option('--apply', 'Write updates to the DB (default is dry run)', false)
    .option(
      '--include-failed',
      'Also attempt FAILED rows (default: only PENDING rows, which are the ones the extraction bug produced)',
      false,
    )
    .option('--limit <n>', 'Max rows to process', (v) => parseInt(v, 10), 500)
    .option('--account <n>', 'Only process a single debit account number')
    .option(
      '--window-days <n>',
      'Provider query window after each transfer creation date',
      (v) => parseInt(v, 10),
      7,
    )
    .option(
      '--tolerance-minutes <n>',
      'Max |provider.createdAt - our.createdAt| for a match',
      (v) => parseInt(v, 10),
      60,
    )
    .option('--no-update-status', 'Only backfill the reference, do not touch status')
    .parse(process.argv);

  const options = program.opts();
  const apply: boolean = options.apply;
  const updateStatus: boolean = options.updateStatus;
  const toleranceMs: number = options.toleranceMinutes * 60 * 1000;

  const baseUrl = process.env.SAFEHAVEN_BASE_URL!;
  const clientId = process.env.SAFEHAVEN_CLIENT_ID!;
  const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID!;
  if (!baseUrl || !clientId || !ibsClientId) {
    console.error(
      'SAFEHAVEN_BASE_URL / SAFEHAVEN_CLIENT_ID / SAFEHAVEN_IBS_CLIENT_ID must be set. Aborting.',
    );
    process.exit(1);
  }

  const statuses = options.includeFailed ? ['PENDING', 'FAILED'] : ['PENDING'];
  const rows = (await prisma.merchantBankTransfer.findMany({
    where: {
      safehavenReference: null,
      status: { in: statuses as any },
      ...(options.account ? { debitAccountNumber: options.account } : {}),
    },
    include: {
      merchant: { include: { bankAccount: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: options.limit,
  })) as TransferRow[];

  console.log(
    `Found ${rows.length} rows with NULL safehavenReference (status in [${statuses}])${apply ? '' : ' — DRY RUN, no writes'}\n`,
  );
  if (rows.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Build groups keyed by the provider account we should query.
  // For main accounts that's the main bank account; for sub-accounts we query
  // the parent main account and then filter the list to the sub-account rows.
  type AugmentedRow = TransferRow & {
    // Provider query params for this row's group.
    queryAccountNumber: string;
    queryAccountId: string | undefined;
    // Is the debit account a sub-account?
    isSubAccount: boolean;
  };
  const byAccount = new Map<string, AugmentedRow[]>();
  const skipped: { ref: string; reason: string }[] = [];

  for (const row of rows) {
    const provider = (row.merchant?.bankAccount as any)?.fiatProvider;
    if (provider && provider !== 'SAFEHAVEN' && provider !== 'SafeHaven') {
      skipped.push({
        ref: row.reference,
        reason: `provider=${provider}, SafeHaven-only script`,
      });
      continue;
    }
    if (!row.debitAccountNumber) {
      skipped.push({ ref: row.reference, reason: 'no debitAccountNumber' });
      continue;
    }

    const mainAccountNumber = (row.merchant?.bankAccount as any)?.accountNumber as
      | string
      | undefined;
    const mainMeta = (row.merchant?.bankAccount as any)?.metadata as any;
    const mainAccountId = (mainMeta?._id ?? mainMeta?.id) as string | undefined;

    // If the debit account is NOT the main account, treat it as a sub-account
    // and query the provider by the parent main account; the provider list
    // returns sub-account transfers under the parent.
    const isSubAccount =
      !!mainAccountNumber && row.debitAccountNumber !== mainAccountNumber;

    const queryAccountNumber = isSubAccount ? mainAccountNumber! : row.debitAccountNumber;
    const queryAccountId = isSubAccount ? mainAccountId : mainAccountId;

    if (!queryAccountNumber) {
      skipped.push({
        ref: row.reference,
        reason: 'no main bank account number for this merchant',
      });
      continue;
    }

    const key = `${queryAccountNumber}::${queryAccountId ?? 'unknown'}`;
    const list: AugmentedRow[] = byAccount.get(key) ?? [];
    list.push(
      Object.assign(row, {
        queryAccountNumber,
        queryAccountId,
        isSubAccount,
      }),
    );
    byAccount.set(key, list);
  }

  const token = await getAccessToken(baseUrl, clientId, ibsClientId);

  let updated = 0;
  let ambiguous = 0;
  let notFound = 0;

  async function fetchProviderList(
    accountNumber: string,
    accountId: string | undefined,
    fromDate: string,
    toDate: string,
  ): Promise<any[]> {
    let page = 1;
    const limit = 100;
    const transfers: any[] = [];
    for (;;) {
      const params: Record<string, any> = { fromDate, toDate, page, limit };
      if (accountId) params.accountId = accountId;
      if (accountNumber) params.accountNumber = accountNumber;
      const resp = await axios.get(`${baseUrl}/transfers`, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          ClientID: ibsClientId,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      const body = resp.data;
      const items = body?.data ?? body ?? [];
      const list = Array.isArray(items) ? items : [items];
      transfers.push(...list);
      if (list.length < limit) break;
      page++;
      if (page > 20) break; // safety cap
    }
    return transfers;
  }

  for (const [, accountRows] of byAccount) {
    const queryAccountNumber = accountRows[0].queryAccountNumber;
    const queryAccountId = accountRows[0].queryAccountId;
    const minCreated = new Date(
      Math.min(...accountRows.map((r) => r.createdAt.getTime())),
    );
    const maxCreated = new Date(
      Math.max(...accountRows.map((r) => r.createdAt.getTime())),
    );
    const fromDate = dateOnly(addDays(minCreated, -1));
    const toDate = dateOnly(
      maxCreated > new Date() ? new Date() : addDays(maxCreated, options.windowDays),
    );

    console.log(
      `[${queryAccountNumber}] fetching provider transfers ${fromDate} → ${toDate} for ${accountRows.length} row(s) accountId=${queryAccountId ?? 'unknown'}`,
    );

    let providerTransfers: any[] = [];
    try {
      providerTransfers = await fetchProviderList(
        queryAccountNumber,
        queryAccountId,
        fromDate,
        toDate,
      );
    } catch (err: any) {
      console.error(
        `  FAILED to fetch provider transfers: status=${err.response?.status} body=${JSON.stringify(err.response?.data || err.message)}`,
      );
      notFound += accountRows.length;
      continue;
    }
    console.log(`  provider returned ${providerTransfers.length} transfer(s)`);

    for (const row of accountRows) {
      const ourAmount = toNumber(row.amount);
      const ourTime = row.createdAt.getTime();
      const candidates = providerTransfers.filter((p) => {
        if (Number(p.amount) !== ourAmount) return false;
        if (
          p.creditAccountNumber &&
          p.creditAccountNumber !== row.beneficiaryAccountNumber
        )
          return false;
        if (
          p.destinationInstitutionCode &&
          p.destinationInstitutionCode !== row.beneficiaryBankCode
        )
          return false;
        // For sub-accounts, the debit account on the provider record is
        // usually the sub-account number, so filter by that when present.
        if (row.isSubAccount && p.debitAccountNumber) {
          if (p.debitAccountNumber !== row.debitAccountNumber) return false;
        }
        const pTime = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
        if (Number.isNaN(pTime)) return false;
        return Math.abs(pTime - ourTime) <= toleranceMs;
      });

      if (candidates.length === 0) {
        console.log(
          `  [${row.reference}] NO MATCH — amount=${ourAmount} beneficiary=${row.beneficiaryAccountNumber} debit=${row.debitAccountNumber} createdAt=${row.createdAt.toISOString()}`,
        );
        notFound++;
        continue;
      }

      candidates.sort(
        (a, b) =>
          Math.abs(new Date(a.createdAt).getTime() - ourTime) -
          Math.abs(new Date(b.createdAt).getTime() - ourTime),
      );
      const best = candidates[0];
      const runnerUp = candidates[1];
      if (
        runnerUp &&
        Math.abs(
          Math.abs(new Date(best.createdAt).getTime() - ourTime) -
            Math.abs(new Date(runnerUp.createdAt).getTime() - ourTime),
        ) <
        60 * 1000
      ) {
        console.log(
          `  [${row.reference}] AMBIGUOUS — ${candidates.length} candidates within 1 min of each other, needs manual review`,
        );
        ambiguous++;
        continue;
      }

      const providerReference: string | null =
        best.sessionId ?? best.paymentReference ?? best._id ?? best.id ?? null;
      if (!providerReference) {
        console.log(
          `  [${row.reference}] SKIP — matched record has no usable id field`,
        );
        ambiguous++;
        continue;
      }

      const providerStatus = mapProviderStatus(best.status);
      const newStatus =
        updateStatus && providerStatus && row.status === 'PENDING'
          ? providerStatus
          : undefined;
      const meta = ((row.metadata as any) || {}) as Record<string, any>;

      console.log(
        `  [${row.reference}] MATCH sessionId=${best.sessionId ?? 'n/a'} status=${best.status} amount=${best.amount} at=${best.createdAt}${apply ? '' : ' (dry run)'}`,
      );

      if (!apply) {
        updated++;
        continue;
      }

      try {
        await prisma.merchantBankTransfer.update({
          where: { id: row.id },
          data: {
            safehavenReference: providerReference,
            ...(newStatus
              ? {
                  status: newStatus as any,
                  ...(newStatus === 'COMPLETED'
                    ? { completedAt: new Date() }
                    : {}),
                }
              : {}),
            metadata: {
              ...meta,
              providerStatus: best.status,
              ...(best._id ? { providerId: best._id } : {}),
              backfilledAt: new Date().toISOString(),
              backfillMatchedBy: 'amount+beneficiary+timestamp',
            } as any,
          },
        });
        console.log(
          `    UPDATED — safehavenReference=${providerReference}${newStatus ? ` status=PENDING→${newStatus}` : ''}`,
        );
        updated++;
      } catch (err: any) {
        console.error(`    UPDATE FAILED — ${err.message}`);
      }
    }
    console.log('');
  }

  console.log(
    `Done. ${apply ? 'updated' : 'would update'}=${updated}, ambiguous=${ambiguous}, not_found=${notFound}, skipped=${skipped.length}`,
  );
  for (const s of skipped) {
    console.log(`  SKIP [${s.ref}] — ${s.reason}`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
