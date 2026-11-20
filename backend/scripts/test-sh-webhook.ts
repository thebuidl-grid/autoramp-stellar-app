import axios from 'axios';

/**
 * Script to test SafeHaven Webhook Discovery and Mapping
 * Usage: npx tsx scripts/test-sh-webhook.ts <virtual_account_id> [port] [account_number]
 */

const virtualAccount = process.argv[2] || '699a9ccb03d9080024fbda89';
const port = process.argv[3] || '3001';
const accountNumber = process.argv[4] || '6023711070';
const url = `http://localhost:${port}/webhook/sh`;

const payload = {
  type: 'virtualAccount.transfer',
  data: {
    _id: '699a9d0b10369400242e28f7',
    virtualAccount: virtualAccount, // This is the SH ID we search for
    paymentReference: `TEST-REF-${Date.now()}`,
    status: 'Completed',
    creditAccountNumber: accountNumber,
    amount: 100,
  },
};

async function testWebhook() {
  console.log(`Sending test webhook to ${url}...`);
  console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

  try {
    const response = await axios.post(url, payload);
    console.log('--- Success ---');
    console.log(`Status: ${response.status}`);
    console.log('Response:', response.data);
  } catch (error: any) {
    console.error('--- Failure ---');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testWebhook();
