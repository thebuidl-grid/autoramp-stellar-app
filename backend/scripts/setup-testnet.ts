/**
 * Stellar Testnet Setup
 *
 * One-time bootstrap for a working AutoRamp testnet environment:
 *  1. Generates issuer + distribution keypairs, funds both via Friendbot.
 *  2. Distribution trusts CNGN and USDC; issuer sends each an initial supply.
 *  3. Seeds a CNGN/USDC liquidity pool so swap quotes (path payments) have
 *     something real to route through.
 *  4. Writes everything to backend/.env.
 *
 * NOTE on "USDC": this issues its own testnet asset under the code
 * "USDC" — it is NOT Circle's real testnet USDC. The app doesn't care who
 * issues an asset, only the code+issuer pair configured via env, so
 * swapping to Circle's real testnet issuer later (if/when actually
 * obtained) is just changing USDC_ISSUER_PUBLIC_KEY — no code changes.
 * This stand-in exists because standing up a *working, swappable* testnet
 * environment right now doesn't depend on Circle's issuer specifically.
 *
 * Run with: npx ts-node -r tsconfig-paths/register scripts/setup-testnet.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  Asset,
  Keypair,
  Horizon,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Networks,
  LiquidityPoolAsset,
  LiquidityPoolFeeV18,
  getLiquidityPoolId,
} from '@stellar/stellar-sdk';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const server = new Horizon.Server(HORIZON_URL);

// Seed liquidity at a rough NGN/USD rate — not meant to be accurate, just
// a plausible ratio so a testnet quote returns a sane-looking number.
const CNGN_SUPPLY = '10000000'; // 10,000,000 CNGN minted to distribution
const USDC_SUPPLY = '1000000'; // 1,000,000 USDC minted to distribution
const POOL_CNGN_AMOUNT = '750000'; // seeded into the pool
const POOL_USDC_AMOUNT = '500'; // => ~1,500 CNGN per USDC

async function fundViaFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Friendbot funding failed for ${publicKey}: ${res.status} ${body}`);
  }
}

async function submit(tx: any, label: string): Promise<void> {
  try {
    await server.submitTransaction(tx);
    console.log(`  ok: ${label}`);
  } catch (error: any) {
    const resultCodes = error?.response?.data?.extras?.result_codes;
    console.error(`  FAILED: ${label}`, resultCodes || error.message);
    throw error;
  }
}

async function main() {
  console.log('=== Stellar testnet setup ===\n');

  console.log('1. Generating keypairs...');
  const issuer = Keypair.random();
  const distribution = Keypair.random();
  console.log(`   issuer:       ${issuer.publicKey()}`);
  console.log(`   distribution: ${distribution.publicKey()}`);

  console.log('\n2. Funding via Friendbot...');
  await fundViaFriendbot(issuer.publicKey());
  console.log('   issuer funded');
  await fundViaFriendbot(distribution.publicKey());
  console.log('   distribution funded');

  const CNGN = new Asset('CNGN', issuer.publicKey());
  const USDC = new Asset('USDC', issuer.publicKey());

  console.log('\n3. Creating trustlines on distribution account...');
  {
    const account = await server.loadAccount(distribution.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: CNGN, limit: '1000000000' }))
      .addOperation(Operation.changeTrust({ asset: USDC, limit: '1000000000' }))
      .setTimeout(180)
      .build();
    tx.sign(distribution);
    await submit(tx, 'trustlines (CNGN, USDC)');
  }

  console.log('\n4. Issuing initial supply to distribution...');
  {
    const account = await server.loadAccount(issuer.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({ destination: distribution.publicKey(), asset: CNGN, amount: CNGN_SUPPLY }))
      .addOperation(Operation.payment({ destination: distribution.publicKey(), asset: USDC, amount: USDC_SUPPLY }))
      .setTimeout(180)
      .build();
    tx.sign(issuer);
    await submit(tx, `mint ${CNGN_SUPPLY} CNGN + ${USDC_SUPPLY} USDC to distribution`);
  }

  console.log('\n5. Seeding CNGN/USDC liquidity pool...');
  const [assetA, assetB] = Asset.compare(CNGN, USDC) < 0 ? [CNGN, USDC] : [USDC, CNGN];
  const poolAsset = new LiquidityPoolAsset(assetA, assetB, LiquidityPoolFeeV18);
  const poolId = getLiquidityPoolId('constant_product', {
    assetA,
    assetB,
    fee: LiquidityPoolFeeV18,
  }).toString('hex');

  {
    const account = await server.loadAccount(distribution.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: poolAsset, limit: '1000000000' }))
      .setTimeout(180)
      .build();
    tx.sign(distribution);
    await submit(tx, 'trust pool share asset');
  }
  {
    const account = await server.loadAccount(distribution.publicKey());
    const maxAmountA = assetA.getCode() === 'CNGN' ? POOL_CNGN_AMOUNT : POOL_USDC_AMOUNT;
    const maxAmountB = assetB.getCode() === 'CNGN' ? POOL_CNGN_AMOUNT : POOL_USDC_AMOUNT;
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: poolId,
          maxAmountA,
          maxAmountB,
          // Wide bounds — this is the pool's bootstrap deposit, so the
          // ratio we provide *is* the initial price; no slippage to guard.
          minPrice: '0.0000001',
          maxPrice: '10000000',
        }),
      )
      .setTimeout(180)
      .build();
    tx.sign(distribution);
    await submit(tx, `deposit ${POOL_CNGN_AMOUNT} CNGN + ${POOL_USDC_AMOUNT} USDC into pool ${poolId}`);
  }

  console.log('\n6. Writing backend/.env...');
  const envPath = path.resolve(__dirname, '..', '.env');
  const jwtSecret = crypto.randomBytes(32).toString('hex');

  const envContent = `# Generated by scripts/setup-testnet.ts on ${new Date().toISOString()}
# Stellar values below are REAL, funded testnet accounts. Everything else
# needs filling in — see comments.

# Auth
JWT_SECRET=${jwtSecret}

# Email (Resend) — REQUIRED to boot the app. Get a real key from resend.com
# (free tier is fine for testnet) and paste it in.
RESEND_API_KEY=REPLACE_ME_RESEND_API_KEY

# FX / Rates — REQUIRED to boot the app. Get a real key from monierate.com.
MONIE_RATE_API_KEY=REPLACE_ME_MONIE_RATE_API_KEY

# Database — REQUIRED to boot the app. Point this at a real Postgres
# instance (local, Docker, or hosted) and run \`npx prisma migrate deploy\`
# against it before starting the app.
DATABASE_URL=postgresql://username:password@host:5432/database_name

# StableStack (Flint) — bank-rail leg. STILL UNVERIFIED: whether Flint
# supports bank-rail-only mode (no EVM settlement) has not been confirmed
# with them. Get real credentials from Flint before this actually works.
STABLESTACK_API_URL=REPLACE_ME_STABLESTACK_API_URL
STABLESTACK_API_KEY=REPLACE_ME_STABLESTACK_API_KEY

# Stellar — REAL, FUNDED testnet accounts, ready to use as-is.
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=${HORIZON_URL}
STELLAR_NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE}"

STELLAR_ISSUER_SECRET=${issuer.secret()}
STELLAR_ISSUER_PUBLIC_KEY=${issuer.publicKey()}

STELLAR_DISTRIBUTION_SECRET=${distribution.secret()}
STELLAR_DISTRIBUTION_PUBLIC_KEY=${distribution.publicKey()}

# CNGN: AutoRamp's own issued testnet asset (issuer above).
CNGN_ISSUER_PUBLIC_KEY=${issuer.publicKey()}

# USDC: a self-issued testnet stand-in (SAME issuer as CNGN) — NOT
# Circle's real testnet USDC. See the comment at the top of
# scripts/setup-testnet.ts for why, and how to swap it later.
USDC_ISSUER_PUBLIC_KEY=${issuer.publicKey()}
`;

  fs.writeFileSync(envPath, envContent);
  console.log(`   wrote ${envPath}`);

  console.log('\n=== Done ===');
  console.log(`Issuer:            ${issuer.publicKey()}`);
  console.log(`Distribution:      ${distribution.publicKey()}`);
  console.log(`Liquidity pool ID: ${poolId}`);
  console.log(
    '\nSecrets were written to backend/.env only (gitignored) — not printed above. Back them up if you want to keep this environment.',
  );
  console.log(
    '\nStill needed before the app can actually boot: a real Postgres DATABASE_URL (+ run migrations), a Resend API key, a MonieRate API key, and real Flint credentials (bank-rail-only support unverified).',
  );
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
