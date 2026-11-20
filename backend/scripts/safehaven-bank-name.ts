import 'dotenv/config';
import axios, { AxiosResponse } from 'axios';

const BANK_CODE = process.argv[2];
if (!BANK_CODE) {
  console.error('Usage: npx ts-node scripts/safehaven-bank-name.ts <bankCode>');
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
  const response: AxiosResponse<any> = await axios.get(`${baseUrl}/transfers/banks`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ClientID: ibsClientId as string,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const banks = response.data?.data ?? [];
  const bank = banks.find((b: any) => b.bankCode === BANK_CODE || b.code === BANK_CODE);

  if (!bank) {
    console.log(`Bank with code ${BANK_CODE} not found.`);
    console.log(`Available banks count: ${banks.length}`);
  } else {
    console.log(JSON.stringify(bank, null, 2));
  }
}

main().catch((err) => {
  console.error('Error:', err.response?.data ?? err.message);
  process.exit(1);
});
