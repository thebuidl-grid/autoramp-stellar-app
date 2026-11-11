import { program } from 'commander';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function getAccessToken(
  baseUrl: string,
  clientId: string,
  ibsClientId: string,
) {
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

async function main() {
  program
    .version('1.0.0')
    .description(
      'Update a SafeHaven sub-account via PUT /accounts/{id}/subaccount (no DB lookup)',
    )
    .requiredOption(
      '--account-id <id>',
      'SafeHaven sub-account id (_id) to update, e.g. 6aac5b8afb85310024194bc1',
    )
    .option(
      '--callback-url <url>',
      'callbackUrl to set (defaults to SH_WEBHOOK_URL env)',
    )
    .option(
      '--status <status>',
      'sub-account status to set (e.g. Active)',
      'Active',
    )
    .option('--auto-sweep <bool>', 'autoSweep flag (true/false)', 'false')
    .option(
      '--dry-run',
      'Show what would be updated without calling the API (default)',
      false,
    )
    .option('--execute', 'Actually perform the PUT (overrides --dry-run)')
    .parse(process.argv);

  const options = program.opts();
  const dryRun = options.dryRun && !options.execute;

  const baseUrl = process.env.SAFEHAVEN_BASE_URL!;
  const clientId = process.env.SAFEHAVEN_CLIENT_ID!;
  const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID!;
  const callbackUrl = options.callbackUrl || process.env.SH_WEBHOOK_URL || '';

  if (!baseUrl || !clientId || !ibsClientId) {
    console.error(
      'SAFEHAVEN_BASE_URL, SAFEHAVEN_CLIENT_ID and SAFEHAVEN_IBS_CLIENT_ID must be set in env. Aborting.',
    );
    process.exit(1);
  }
  if (!callbackUrl) {
    console.error(
      'callbackUrl not provided (--callback-url or SH_WEBHOOK_URL env). Aborting.',
    );
    process.exit(1);
  }

  const autoSweep = options.autoSweep === 'true';

  console.log(`Base URL: ${baseUrl}`);
  console.log(`Account id: ${options.accountId}`);
  console.log(`callbackUrl: ${callbackUrl}`);
  console.log(`status: ${options.status}`);
  console.log(`autoSweep: ${autoSweep}`);
  console.log(`Dry run: ${dryRun}\n`);

  if (dryRun) {
    console.log(
      `DRY RUN — would PUT /accounts/${options.accountId}/subaccount`,
    );
    console.log(
      `  body: ${JSON.stringify({ callbackUrl, status: options.status, autoSweep })}`,
    );
    return;
  }

  try {
    const token = await getAccessToken(baseUrl, clientId, ibsClientId);
    const resp = await axios.put(
      `${baseUrl}/accounts/${options.accountId}/subaccount`,
      {
        callbackUrl,
        status: options.status,
        autoSweep,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ClientID: ibsClientId,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    console.log(`OK — status=${resp.status}`);
    console.log(JSON.stringify(resp.data, null, 2));
  } catch (err: any) {
    console.error(
      `FAILED — status=${err.response?.status} body=${JSON.stringify(err.response?.data || err.message)}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
