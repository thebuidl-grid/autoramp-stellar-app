import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const STABLESTACK_API_KEY = process.env.STABLESTACK_API_KEY;
const STABLESTACK_API_URL = process.env.STABLESTACK_API_URL;

async function fetchQuote() {
  if (!STABLESTACK_API_KEY || !STABLESTACK_API_URL) {
    console.error('Missing environment variables:');
    console.error('STABLESTACK_API_KEY:', !!STABLESTACK_API_KEY);
    console.error('STABLESTACK_API_URL:', !!STABLESTACK_API_URL);
    return;
  }

  const url = `${STABLESTACK_API_URL}/v1/spec-ops/otc/onramp/quote`;
  const payload = {
    amount: 10000,
    currency: 'NGN',
    network: 'base',
    asset: 'usdc',
    feePercent: 0.15,
  };

  console.log('Fetching quote from:', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'x-api-key': STABLESTACK_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    if (error.response) {
      console.error('Error Response Status:', error.response.status);
      console.error(
        'Error Response Data:',
        JSON.stringify(error.response.data, null, 2),
      );
    } else {
      console.error('Error:', error.message);
    }
  }
}

fetchQuote();
