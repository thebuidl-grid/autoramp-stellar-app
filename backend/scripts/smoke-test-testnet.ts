/**
 * Live testnet smoke test.
 *
 * Exercises the exact mechanics StellarService/SwapService/StablestackService
 * perform, against the real accounts scripts/setup-testnet.ts created —
 * not mocks. Simulates one full user journey:
 *   1. A fresh "user" wallet gets a sponsored CNGN trustline (pays no reserve).
 *   2. AutoRamp mints CNGN to it (the onramp mint step).
 *   3. A real swap quote is fetched from the seeded liquidity pool.
 *   4. The user swaps CNGN -> USDC via a real PathPaymentStrictSend.
 *   5. The user sends CNGN back to the distribution account with a memo
 *      (the offramp deposit step), and memo-based lookup finds it.
 *
 * Run with: npx ts-node -r tsconfig-paths/register scripts/smoke-test-testnet.ts
 * Requires backend/.env from scripts/setup-testnet.ts to already exist.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import {
  Asset,
  Keypair,
  Horizon,
  TransactionBuilder,
  Operation,
  Memo,
  BASE_FEE,
  Networks,
} from '@stellar/stellar-sdk';

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
const server = new Horizon.Server(HORIZON_URL);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set — run scripts/setup-testnet.ts first`);
  return v;
}

async function fundViaFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) throw new Error(`Friendbot funding failed: ${res.status} ${await res.text()}`);
}

async function getXlmBalance(publicKey: string): Promise<number> {
  const account = await server.loadAccount(publicKey);
  const line = account.balances.find((b: any) => b.asset_type === 'native');
  return line ? parseFloat(line.balance) : 0;
}

async function getAssetBalance(publicKey: string, asset: Asset): Promise<string | null> {
  const account = await server.loadAccount(publicKey);
  const line = account.balances.find(
    (b: any) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
  );
  return line ? (line as any).balance : null;
}

async function main() {
  const distributionSecret = requireEnv('STELLAR_DISTRIBUTION_SECRET');
  const distribution = Keypair.fromSecret(distributionSecret);
  const issuerPublicKey = requireEnv('CNGN_ISSUER_PUBLIC_KEY');
  const CNGN = new Asset('CNGN', issuerPublicKey);
  const USDC = new Asset('USDC', requireEnv('USDC_ISSUER_PUBLIC_KEY'));

  console.log('=== Live testnet smoke test ===\n');

  console.log('0. Creating + funding a fresh test user wallet...');
  const user = Keypair.random();
  await fundViaFriendbot(user.publicKey());
  const xlmBefore = await getXlmBalance(user.publicKey());
  console.log(`   user: ${user.publicKey()}`);
  console.log(`   XLM balance after friendbot funding: ${xlmBefore}`);

  console.log('\n1. Sponsored trustline (StellarService.buildSponsoredTrustlineTransaction logic)...');
  {
    const userAccount = await server.loadAccount(user.publicKey());
    const tx = new TransactionBuilder(userAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: user.publicKey(),
          source: distribution.publicKey(),
        }),
      )
      .addOperation(Operation.changeTrust({ asset: CNGN }))
      .addOperation(Operation.endSponsoringFutureReserves({}))
      .setTimeout(180)
      .build();

    // Backend signs first (as sponsor)...
    tx.sign(distribution);
    // ...then the user signs (as the frontend/wallet would).
    tx.sign(user);
    await server.submitTransaction(tx);

    const xlmAfter = await getXlmBalance(user.publicKey());
    console.log(`   trustline created. XLM balance after: ${xlmAfter} (spent only ${(xlmBefore - xlmAfter).toFixed(7)} — the fee, not a reserve)`);
  }

  console.log('\n2. Minting CNGN to the user (StellarService.sendFromDistribution logic — the onramp mint step)...');
  {
    const distAccount = await server.loadAccount(distribution.publicKey());
    const tx = new TransactionBuilder(distAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({ destination: user.publicKey(), asset: CNGN, amount: '5000' }))
      .setTimeout(180)
      .build();
    tx.sign(distribution);
    await server.submitTransaction(tx);
    console.log(`   minted 5000 CNGN. User CNGN balance: ${await getAssetBalance(user.publicKey(), CNGN)}`);
  }

  console.log('\n3. Fetching a real swap quote from the seeded pool (StellarService.getStrictSendQuote logic)...');
  let quotedDestAmount = '0';
  {
    const paths = await server.strictSendPaths(CNGN, '1000', [USDC]).call();
    const best = paths.records[0];
    if (!best) throw new Error('No path found — is the liquidity pool actually seeded?');
    quotedDestAmount = best.destination_amount;
    console.log(`   1000 CNGN -> ${best.destination_amount} USDC (via ${best.path.length}-hop path)`);
  }

  console.log('\n3b. Trusting the destination asset (USDC) before swapping — Stellar never auto-creates this; the real app gates swap execution on exactly this check via useSwapExecution\'s needsTrustline/handleAddTrustline)...');
  {
    const userAccount = await server.loadAccount(user.publicKey());
    const tx = new TransactionBuilder(userAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: USDC }))
      .setTimeout(180)
      .build();
    tx.sign(user);
    await server.submitTransaction(tx);
    console.log('   USDC trustline created');
  }

  console.log('\n4. Executing the swap as a real PathPaymentStrictSend (StellarService.buildPathPaymentTransaction logic)...');
  {
    const userAccount = await server.loadAccount(user.publicKey());
    const destMin = (parseFloat(quotedDestAmount) * 0.95).toFixed(7); // 5% slippage tolerance
    const tx = new TransactionBuilder(userAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset: CNGN,
          sendAmount: '1000',
          destination: user.publicKey(),
          destAsset: USDC,
          destMin,
        }),
      )
      .setTimeout(180)
      .build();
    tx.sign(user);
    const result = await server.submitTransaction(tx);
    console.log(`   swap submitted: ${result.hash}`);
    console.log(`   user CNGN balance: ${await getAssetBalance(user.publicKey(), CNGN)}`);
    console.log(`   user USDC balance: ${await getAssetBalance(user.publicKey(), USDC)}`);
  }

  console.log('\n5. Offramp deposit: user sends CNGN back to distribution with a memo, then memo-based lookup finds it (StablestackService.confirmOfframpDeposit / OfframpDepositWatcherService logic)...');
  const memo = `smoketest_${Date.now()}`;
  let depositHash = '';
  {
    const userAccount = await server.loadAccount(user.publicKey());
    const tx = new TransactionBuilder(userAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({ destination: distribution.publicKey(), asset: CNGN, amount: '500' }))
      .addMemo(Memo.text(memo))
      .setTimeout(180)
      .build();
    tx.sign(user);
    const result = await server.submitTransaction(tx);
    depositHash = result.hash;
    console.log(`   sent 500 CNGN to distribution with memo "${memo}", hash: ${depositHash}`);
  }
  {
    const payments = await server.payments().forAccount(distribution.publicKey()).order('desc').limit(20).call();
    let found: { amount: string; transactionHash: string } | null = null;
    for (const payment of payments.records as any[]) {
      const isMatch =
        payment.type === 'payment' &&
        payment.to === distribution.publicKey() &&
        payment.asset_code === 'CNGN' &&
        payment.asset_issuer === issuerPublicKey;
      if (!isMatch) continue;
      const tx = await payment.transaction();
      if (tx.memo === memo) {
        found = { amount: payment.amount, transactionHash: payment.transaction_hash };
        break;
      }
    }
    if (!found) throw new Error('Memo-based deposit lookup failed to find the payment we just sent');
    console.log(`   found via memo lookup: ${found.amount} CNGN, tx ${found.transactionHash} (matches: ${found.transactionHash === depositHash})`);
  }

  console.log('\n=== All mechanics verified against live testnet ===');
}

main().catch((err) => {
  console.error('\nSmoke test failed:', err?.response?.data?.extras?.result_codes || err.message);
  process.exit(1);
});
