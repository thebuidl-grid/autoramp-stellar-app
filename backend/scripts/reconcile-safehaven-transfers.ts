import 'dotenv/config';
import axios, { AxiosResponse } from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const baseUrl = process.env.SAFEHAVEN_BASE_URL;
const clientId = process.env.SAFEHAVEN_CLIENT_ID;
const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID;

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

async function getAccessToken(): Promise<string> {
  const response: AxiosResponse<any> = await axios.post(
    `${baseUrl}/oauth2/token`,
    {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_assertion: ibsClientId,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
  );
  return response.data.access_token as string;
}

async function getTransferStatus(token: string, paymentReference: string) {
  try {
    const response: AxiosResponse<any> = await axios.post(
      `${baseUrl}/transfers/status`,
      { paymentReference },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ClientID: ibsClientId as string,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    return response.data;
  } catch (err: any) {
    return { error: err.response?.data ?? err.message };
  }
}

async function getAllTransfers(token: string): Promise<any[]> {
  const response: AxiosResponse<any> = await axios.get(`${baseUrl}/transfers`, {
    params: { page: 0, limit: 100 },
    headers: {
      Authorization: `Bearer ${token}`,
      ClientID: ibsClientId as string,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  return response.data?.data ?? [];
}

async function main() {
  if (!APPLY && !DRY_RUN) {
    console.log('Usage:');
    console.log('  npx ts-node scripts/reconcile-safehaven-transfers.ts --dry-run   # preview only');
    console.log('  npx ts-node scripts/reconcile-safehaven-transfers.ts --apply     # apply updates');
    process.exit(1);
  }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  const pendingTransfers = await prisma.merchantBankTransfer.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  console.log(`Found ${pendingTransfers.length} PENDING merchant bank transfers`);

  if (pendingTransfers.length === 0) {
    process.exit(0);
  }

  const token = await getAccessToken();

  // Fallback: fetch all transfers once to cross-check unknowns by reference.
  console.log(`\nFetching full transfer list from SafeHaven for fallback cross-check...`);
  const allTransfers = await getAllTransfers(token);
  console.log(`Fetched ${allTransfers.length} transfers from SafeHaven`);

  const toUpdate: Array<{ id: string; reference: string; safehavenStatus: string; amount: number }> = [];
  const notFound: Array<{ id: string; reference: string }> = [];
  const other: Array<{ id: string; reference: string; status: string }> = [];

  for (const tx of pendingTransfers) {
    const ref = tx.reference;
    const statusRes = await getTransferStatus(token, ref);

    // SafeHaven returns data inside a `data` or directly
    let shData = statusRes?.data ?? statusRes;
    let shStatus = (shData?.status ?? shData?.responseMessage ?? JSON.stringify(statusRes?.error ?? 'UNKNOWN')).toString();

    // Fallback: search the full transfer list if the status endpoint returned unknown/error.
    const isUnknown = shStatus === 'UNKNOWN' || statusRes.error;
    if (isUnknown) {
      const matched = allTransfers.find((t: any) => t.paymentReference === ref);
      if (matched) {
        shData = matched;
        shStatus = matched.status ?? 'UNKNOWN';
      }
    }

    console.log(`\n- DB id: ${tx.id} | ref: ${ref} | amount: ${tx.amount} | SH status: ${shStatus}`);

    if (shStatus === 'UNKNOWN' || statusRes.error) {
      notFound.push({ id: tx.id, reference: ref });
      continue;
    }

    // Treat these SafeHaven statuses as successful
    const completedStatuses = ['Completed', 'completed', 'Approved or completed successfully', 'Approved or Completed Successfully'];
    if (completedStatuses.some((s) => shStatus.toLowerCase().includes(s.toLowerCase()))) {
      toUpdate.push({ id: tx.id, reference: ref, safehavenStatus: shStatus, amount: Number(tx.amount) });
    } else {
      other.push({ id: tx.id, reference: ref, status: shStatus });
    }
  }

  console.log(`\n============================================`);
  console.log(`Will mark COMPLETED: ${toUpdate.length}`);
  console.log(`Not found in SafeHaven: ${notFound.length}`);
  console.log(`Other/Still pending in SafeHaven: ${other.length}`);

  if (toUpdate.length > 0) {
    console.log(`\nTransactions to update:`);
    for (const u of toUpdate) {
      console.log(`  - ${u.reference} | ${u.amount} | ${u.safehavenStatus}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\nDry run complete. No DB changes made.`);
    console.log(`Run with --apply to update these ${toUpdate.length} records to COMPLETED.`);
  }

  if (APPLY) {
    if (toUpdate.length === 0) {
      console.log(`No updates needed.`);
      process.exit(0);
    }

    const now = new Date();
    let updatedCount = 0;
    for (const u of toUpdate) {
      await prisma.merchantBankTransfer.update({
        where: { id: u.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          updatedAt: now,
        },
      });
      updatedCount++;
      console.log(`Updated ${u.reference} → COMPLETED`);
    }
    console.log(`\nUpdated ${updatedCount} records.`);
  }
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
