import 'dotenv/config';
import axios, { AxiosResponse } from 'axios';

const ACCOUNT_NUMBER = process.argv[2];
if (!ACCOUNT_NUMBER) {
  console.error('Usage: npx ts-node scripts/find-safehaven-reversal.ts <accountNumber>');
  process.exit(1);
}

const baseUrl = process.env.SAFEHAVEN_BASE_URL;
const clientId = process.env.SAFEHAVEN_CLIENT_ID;
const ibsClientId = process.env.SAFEHAVEN_IBS_CLIENT_ID;

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

async function main() {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ClientID: ibsClientId as string,
    'Content-Type': 'application/json',
  };

  // Fetch all transfers for the client
  const transfersRes: AxiosResponse<any> = await axios.get(`${baseUrl}/transfers`, {
    params: { page: 0, limit: 100 },
    headers,
    timeout: 30000,
  });

  const allTransfers = transfersRes.data?.data ?? [];

  // Find transactions for the given account
  const accountTxs = allTransfers.filter(
    (tx: any) =>
      tx.debitAccountNumber === ACCOUNT_NUMBER ||
      tx.creditAccountNumber === ACCOUNT_NUMBER,
  );

  // Look for reversed transactions or amounts around 79-80
  const reversed = accountTxs.filter((tx: any) => tx.isReversed === true);
  const around80 = accountTxs.filter(
    (tx: any) => tx.amount >= 70 && tx.amount <= 90,
  );

  console.log(`Total transfers fetched: ${allTransfers.length}`);
  console.log(`Transactions for account ${ACCOUNT_NUMBER}: ${accountTxs.length}`);
  console.log(`\nReversed transactions: ${reversed.length}`);
  if (reversed.length === 0) {
    console.log('None found.');
  } else {
    console.log(JSON.stringify(reversed, null, 2));
  }

  console.log(`\nTransactions with amount between ₦70 and ₦90: ${around80.length}`);
  if (around80.length === 0) {
    console.log('None found.');
  } else {
    console.log(
      JSON.stringify(
        around80.map((tx: any) => ({
          id: tx._id,
          type: tx.type,
          status: tx.status,
          amount: tx.amount,
          narration: tx.narration,
          isReversed: tx.isReversed,
          reversalReference: tx.reversalReference,
          debitAccountNumber: tx.debitAccountNumber,
          creditAccountNumber: tx.creditAccountNumber,
          paymentReference: tx.paymentReference,
          createdAt: tx.createdAt,
        })),
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error('Error:', err.response?.data ?? err.message);
  process.exit(1);
});
