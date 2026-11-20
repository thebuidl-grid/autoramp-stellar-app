// Real Stellar testnet USDC deposits used as on-chain evidence for the D1 scenarios.
// The deposits are REAL payments (Circle testnet USDC) from the demo wallet to a demo-controlled "funding address".
// What the payout provider does afterwards (reject / reverse / run out of liquidity) is SIMULATED by the backend.
//
//   DEMO_WALLET_FILE=~/.config/autoramp-demo/wallet.json node scripts/d1-real-deposits.mjs --out ../autoramp-backend/docs/d1-evidence/real-deposits.json
//
// Idempotent: a deposit already recorded in --out is not sent again (use --force to resend).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const out = process.argv[process.argv.indexOf("--out") + 1];
if (!out || out.startsWith("--")) throw new Error("--out <file> is required");
const force = process.argv.includes("--force");
const wallet = JSON.parse(fs.readFileSync(process.env.DEMO_WALLET_FILE, "utf8"));
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // Circle's Stellar testnet USDC
const USDC = new Asset("USDC", ISSUER);

// scenario -> amount actually deposited (USDC). Memo identifies the scenario on the explorer.
const PLAN = {
  partial: { amount: "2.5", expected: "5", memo: "d1-partial" },
  rejected: { amount: "1", expected: "1", memo: "d1-rejected" },
  reversal: { amount: "1", expected: "1", memo: "d1-reversal" },
  liquidity: { amount: "1", expected: "1", memo: "d1-liquidity" },
};

const fundingFile = path.join(os.homedir(), ".config/autoramp-demo/d1-funding.json");
async function funding() {
  if (fs.existsSync(fundingFile)) return JSON.parse(fs.readFileSync(fundingFile, "utf8"));
  const kp = Keypair.random();
  const r = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error("friendbot failed: " + r.status);
  const acct = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: USDC })).setTimeout(60).build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);
  const f = { address: kp.publicKey(), secret: kp.secret() };
  fs.mkdirSync(path.dirname(fundingFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(fundingFile, JSON.stringify(f), { mode: 0o600 });
  return f;
}

const existing = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : { deposits: {} };
const f = await funding();
const src = Keypair.fromSecret(wallet.stellar.secret);
const result = { network: "stellar-testnet", asset: "USDC", usdcIssuer: ISSUER, sender: src.publicKey(), fundingAddress: f.address, deposits: { ...existing.deposits } };

for (const [key, p] of Object.entries(PLAN)) {
  if (result.deposits[key] && !force) { console.log(`${key}: already sent (${result.deposits[key].hash.slice(0, 12)}…)`); continue; }
  const acct = await horizon.loadAccount(src.publicKey());
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: f.address, asset: USDC, amount: p.amount }))
    .addMemo(Memo.text(p.memo)).setTimeout(60).build();
  tx.sign(src);
  const res = await horizon.submitTransaction(tx);
  result.deposits[key] = { amount: p.amount, expected: p.expected, memo: p.memo, hash: res.hash, ledger: res.ledger, url: `https://stellar.expert/explorer/testnet/tx/${res.hash}` };
  console.log(`${key}: sent ${p.amount} USDC  ${res.hash}  (ledger ${res.ledger})`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log("saved", out);
