/**
 * update-all-subaccounts.ts
 *
 * Fetches every MerchantSubAccount from the DB and runs a PUT
 * /accounts/{safehavenId}/subaccount on each one.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/update-all-subaccounts.ts [options]
 *
 * Options:
 *   --callback-url <url>   callbackUrl to set (defaults to SH_WEBHOOK_URL env)
 *   --status <status>      sub-account status (default: Active)
 *   --auto-sweep <bool>    autoSweep flag (default: false)
 *   --concurrency <n>      parallel requests at once (default: 3)
 *   --output <path>        JSON results file (default: subaccount-update-results.json)
 *   --dry-run              Print what would happen, no API calls
 *   --execute              Actually run the updates (required to go live)
 */

import { program } from 'commander';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

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
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
  );
  return response.data.access_token;
}

/** Run promises in chunks of `concurrency` at a time */
async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((item, j) => fn(item, i + j)),
    );
    results.push(...chunkResults);
  }
  return results;
}

interface SubAccountRecord {
  id: string;
  merchantId: string;
  safehavenId: string;
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
}

interface ResultEntry {
  id: string;
  merchantId: string;
  safehavenId: string;
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
  status: 'dry-run' | 'ok' | 'error';
  httpStatus?: number;
  response?: unknown;
  error?: string;
}

async function main() {
  program
    .version('1.0.0')
    .description(
      'Update ALL SafeHaven sub-accounts in the DB via PUT /accounts/{id}/subaccount',
    )
    .option(
      '--callback-url <url>',
      'callbackUrl to set (defaults to SH_WEBHOOK_URL env)',
    )
    .option('--status <status>', 'sub-account status to set', 'Active')
    .option('--auto-sweep <bool>', 'autoSweep flag (true/false)', 'false')
    .option('--concurrency <n>', 'parallel requests at once', '3')
    .option(
      '--output <path>',
      'path to write JSON results',
      'subaccount-update-results.json',
    )
    .option('--dry-run', 'Show what would be updated, no API calls', false)
    .option('--execute', 'Actually perform the PUTs (overrides --dry-run)')
    .parse(process.argv);

  const options = program.opts();
  const dryRun = !options.execute;
  const concurrency = Math.max(1, parseInt(options.concurrency, 10) || 3);
  const outputPath = path.resolve(options.output);

  const baseUrl = process.env.SAFEHAVEN_BASE_URL!;
  const clientId = process.env.SAFEHAVEN_CLIENT_ID!;
  const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID!;
  const callbackUrl = options.callbackUrl || process.env.SH_WEBHOOK_URL || '';
  const autoSweep = options.autoSweep === 'true';

  // Validate env
  if (!baseUrl || !clientId || !ibsClientId) {
    console.error(
      'SAFEHAVEN_BASE_URL, SAFEHAVEN_CLIENT_ID, and SAFEHAVEN_IBS_CLIENT_ID must be set. Aborting.',
    );
    process.exit(1);
  }
  if (!callbackUrl) {
    console.error(
      'callbackUrl not provided (--callback-url or SH_WEBHOOK_URL env). Aborting.',
    );
    process.exit(1);
  }

  console.log('=== update-all-subaccounts ===');
  console.log(`Base URL    : ${baseUrl}`);
  console.log(`callbackUrl : ${callbackUrl}`);
  console.log(`status      : ${options.status}`);
  console.log(`autoSweep   : ${autoSweep}`);
  console.log(`concurrency : ${concurrency}`);
  console.log(`Output file : ${outputPath}`);
  console.log(`Dry run     : ${dryRun}\n`);

  // Fetch all subaccounts
  const subAccounts: SubAccountRecord[] =
    await prisma.merchantSubAccount.findMany({
      select: {
        id: true,
        merchantId: true,
        safehavenId: true,
        accountNumber: true,
        accountName: true,
        bankName: true,
      },
      orderBy: { createdAt: 'asc' },
    });

  console.log(`Found ${subAccounts.length} sub-account(s) in DB.\n`);

  if (subAccounts.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log('DRY RUN — listing what would be updated:\n');
    const results: ResultEntry[] = subAccounts.map((sa) => {
      console.log(
        `  [DRY RUN] safehavenId=${sa.safehavenId}  accountNumber=${sa.accountNumber}  merchant=${sa.merchantId}`,
      );
      return {
        ...sa,
        status: 'dry-run' as const,
        wouldSend: { callbackUrl, status: options.status, autoSweep },
      } as ResultEntry;
    });
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nDry-run results saved to ${outputPath}`);
    await prisma.$disconnect();
    return;
  }

  // Get token once (reused for all calls)
  console.log('Fetching SafeHaven access token…');
  let token: string;
  try {
    token = await getAccessToken(baseUrl, clientId, ibsClientId);
    console.log('Token acquired.\n');
  } catch (err: any) {
    console.error(
      'Failed to get access token:',
      err.response?.data || err.message,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  let okCount = 0;
  let errCount = 0;

  const results: ResultEntry[] = await pMap(
    subAccounts,
    async (sa, idx) => {
      const label = `[${idx + 1}/${subAccounts.length}] safehavenId=${sa.safehavenId}`;
      try {
        const resp = await axios.put(
          `${baseUrl}/accounts/${sa.safehavenId}/subaccount`,
          { callbackUrl, status: options.status, autoSweep },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30_000,
          },
        );
        okCount++;
        console.log(`  ✓ ${label}  HTTP ${resp.status}`);
        return {
          ...sa,
          status: 'ok' as const,
          httpStatus: resp.status,
          response: resp.data,
        };
      } catch (err: any) {
        errCount++;
        const errMsg = JSON.stringify(
          err.response?.data || err.message,
        );
        console.error(`  ✗ ${label}  HTTP ${err.response?.status}  ${errMsg}`);
        return {
          ...sa,
          status: 'error' as const,
          httpStatus: err.response?.status,
          error: errMsg,
        };
      }
    },
    concurrency,
  );

  // Write results JSON
  const output = {
    runAt: new Date().toISOString(),
    total: subAccounts.length,
    ok: okCount,
    errors: errCount,
    results,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n=== Done ===`);
  console.log(`  Total : ${subAccounts.length}`);
  console.log(`  OK    : ${okCount}`);
  console.log(`  Errors: ${errCount}`);
  console.log(`  Results saved to: ${outputPath}`);

  await prisma.$disconnect();
  if (errCount > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
