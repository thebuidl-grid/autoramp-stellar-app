import { PrismaClient } from '@prisma/client';
import { program } from 'commander';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

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
      'Fix sub-account callback URLs to point to our webhook endpoint',
    )
    .option(
      '--dry-run',
      'Show what would be updated without making changes',
      false,
    )
    .parse(process.argv);

  const options = program.opts();
  const dryRun = options.dryRun;

  const baseUrl = process.env.SAFEHAVEN_BASE_URL!;
  const clientId = process.env.SAFEHAVEN_CLIENT_ID!;
  const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID!;
  const shWebhookUrl = process.env.SH_WEBHOOK_URL || '';

  if (!shWebhookUrl) {
    console.error('SH_WEBHOOK_URL is not set in env. Aborting.');
    process.exit(1);
  }

  console.log(`Callback URL to set: ${shWebhookUrl}`);
  console.log(`Dry run: ${dryRun}\n`);

  const subAccounts = await prisma.merchantSubAccount.findMany({
    where: {
      safehavenId: { not: '' },
    },
    select: {
      id: true,
      merchantId: true,
      safehavenId: true,
      accountNumber: true,
      accountName: true,
      metadata: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${subAccounts.length} sub-accounts with SafeHaven IDs\n`);

  if (subAccounts.length === 0) {
    console.log('Nothing to update.');
    await prisma.$disconnect();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const sub of subAccounts) {
    const meta = (sub.metadata as any) || {};
    const shId = sub.safehavenId || meta._id || meta.id;

    if (!shId) {
      console.log(`[${sub.accountNumber}] SKIP — no SafeHaven ID`);
      continue;
    }

    console.log(`[${sub.accountNumber}] ${sub.accountName || 'N/A'}`);

    if (dryRun) {
      console.log(`  DRY RUN — would PUT /accounts/${shId}/subaccount`);
      console.log(`  callbackUrl: ${shWebhookUrl}\n`);
      success++;
      continue;
    }

    try {
      const token = await getAccessToken(baseUrl, clientId, ibsClientId);

      // Fetch existing sub-account from SafeHaven
      const existing = await axios.get(`${baseUrl}/accounts/${shId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ClientID: ibsClientId,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      const acct = existing.data?.data || existing.data;

      if (!acct.isSubAccount) {
        console.log(
          `  SKIP — not a sub-account on SafeHaven (isSubAccount: false)`,
        );
        continue;
      }

      // Extract required fields from SafeHaven response + our metadata
      const subDetails = acct.subAccountDetails || {};
      const phoneNumber =
        subDetails.phoneNumber || meta.phoneNumber || '2340000000000';
      const emailAddress = subDetails.emailAddress || meta.emailAddress || '';
      const externalReference =
        acct.externalReference || meta.externalReference || '';

      if (!emailAddress) {
        console.log(`  SKIP — no emailAddress available`);
        continue;
      }

      const payload: Record<string, any> = {
        phoneNumber,
        emailAddress,
        externalReference,
        identityType: acct.identityType || meta.identityType || 'BVN',
        callbackUrl: shWebhookUrl,
      };
      if (acct.identityNumber || meta.identityNumber) {
        payload.identityNumber = acct.identityNumber || meta.identityNumber;
      }
      if (acct.identityId || meta.identityId) {
        payload.identityId = acct.identityId || meta.identityId;
      }

      console.log(`  PUT /accounts/${shId}/subaccount`);
      console.log(`  payload: ${JSON.stringify(payload)}`);
      const resp = await axios.put(
        `${baseUrl}/accounts/${shId}/subaccount`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );
      const newCallback =
        resp.data?.data?.autoSweepDetails?.callbackUrl ||
        resp.data?.autoSweepDetails?.callbackUrl ||
        'set';
      console.log(`  OK — callbackUrl: ${newCallback}\n`);
      success++;
    } catch (err: any) {
      console.error(
        `  FAILED — status=${err.response?.status} body=${JSON.stringify(err.response?.data || err.message)}\n`,
      );
      failed++;
    }
  }

  console.log(`Done. success=${success}, failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
