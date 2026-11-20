/**
 * Fetch SafeHaven account balance + transaction history for a given account number.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/fetch-safehaven-account.ts 5012518213
 */
import 'dotenv/config';
import axios, { AxiosResponse } from 'axios';

const ACCOUNT_NUMBER = process.argv[2];
if (!ACCOUNT_NUMBER) {
  console.error('Usage: npx ts-node scripts/fetch-safehaven-account.ts <accountNumber>');
  process.exit(1);
}

const baseUrl = process.env.SAFEHAVEN_BASE_URL;
const clientId = process.env.SAFEHAVEN_CLIENT_ID;
const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID;

if (!baseUrl || !clientId || !ibsClientId) {
  console.error('Missing SafeHaven env vars: SAFEHAVEN_BASE_URL, SAFEHAVEN_CLIENT_ID, SAFEHAVEN_IBS_CLIENT_ID');
  process.exit(1);
}

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

  if (!response.data?.access_token) {
    throw new Error(`Token response missing access_token: ${JSON.stringify(response.data)}`);
  }
  return response.data.access_token as string;
}

async function main() {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ClientID: ibsClientId as string,
    'Content-Type': 'application/json',
  };

  // 1. Find the SafeHaven account by account number to obtain its _id (and balance).
  const accountsRes: AxiosResponse<any> = await axios.get(`${baseUrl}/accounts`, {
    params: { page: 0, limit: 100, isSubAccount: true },
    headers,
    timeout: 30000,
  });

  const accounts = accountsRes.data?.data ?? [];
  const matchedAccount = accounts.find(
    (acc: any) => acc.accountNumber === ACCOUNT_NUMBER || acc.nuban === ACCOUNT_NUMBER,
  );

  if (!matchedAccount) {
    console.error(`Account ${ACCOUNT_NUMBER} not found in SafeHaven accounts list.`);
    process.exit(1);
  }

  const accountId = matchedAccount._id;

  // 2. Get fresh account details (balance).
  const accountDetailsRes: AxiosResponse<any> = await axios.get(`${baseUrl}/accounts/${accountId}`, {
    headers,
    timeout: 30000,
  });

  // 3. Get transaction history for the account number.
  const transfersRes: AxiosResponse<any> = await axios.get(`${baseUrl}/transfers`, {
    params: { accountNumber: ACCOUNT_NUMBER, page: 0, limit: 50 },
    headers,
    timeout: 30000,
  });

  const accountData = accountDetailsRes.data?.data ?? accountDetailsRes.data;
  const allTransfers = transfersRes.data?.data ?? [];

  // Filter transfers where this account is either debit or credit.
  const accountTransactions = allTransfers.filter(
    (tx: any) =>
      tx.debitAccountNumber === ACCOUNT_NUMBER ||
      tx.creditAccountNumber === ACCOUNT_NUMBER,
  );

  const summary = {
    accountNumber: ACCOUNT_NUMBER,
    accountName: accountData?.accountName,
    accountType: accountData?.accountType,
    currency: accountData?.currencyCode,
    status: accountData?.status,
    accountBalance: accountData?.accountBalance,
    bookBalance: accountData?.bookBalance,
    transactionCount: accountTransactions.length,
    transactions: accountTransactions.map((tx: any) => ({
      id: tx._id,
      type: tx.type,
      status: tx.status,
      amount: tx.amount,
      narration: tx.narration,
      debitAccountName: tx.debitAccountName,
      debitAccountNumber: tx.debitAccountNumber,
      creditAccountName: tx.creditAccountName,
      creditAccountNumber: tx.creditAccountNumber,
      paymentReference: tx.paymentReference,
      createdAt: tx.createdAt,
    })),
  };

  const fs = await import('fs/promises');
  const outputFile = `/tmp/safehaven-${ACCOUNT_NUMBER}.json`;
  await fs.writeFile(outputFile, JSON.stringify({
    account: accountData,
    transactions: accountTransactions,
  }, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nFull raw response written to: ${outputFile}`);
}

main().catch((err) => {
  console.error('Error fetching SafeHaven data:', err.response?.data ?? err.message);
  process.exit(1);
});
