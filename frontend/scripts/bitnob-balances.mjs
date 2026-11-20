// Lists your Bitnob balances (GET /api/balances) with an HMAC-signed request.
//
// Run:  node --env-file-if-exists=.env.local scripts/bitnob-balances.mjs
// Needs BITNOB_CLIENT_ID and BITNOB_KEY (your client secret) in the environment or in .env.local. Optional:
// BITNOB_API_URL (default https://api.bitnob.com). Any other path works too:  ... bitnob-balances.mjs /api/whoami
import { createHmac, randomBytes } from "node:crypto";

const id = (process.env.BITNOB_CLIENT_ID || "").trim();
const secret = (process.env.BITNOB_KEY || process.env.BITNOB_CLIENT_SECRET || "").trim();
const base = (process.env.BITNOB_API_URL || "https://api.bitnob.com").replace(/\/+$/, "");
const path = process.argv[2] || "/api/balances";

if (!id || !secret) {
  console.error("Set BITNOB_CLIENT_ID and BITNOB_KEY (client secret) in your environment or .env.local.");
  process.exit(1);
}

const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = randomBytes(16).toString("hex");
// Signature = HMAC-SHA256 of CLIENT_ID:TIMESTAMP:NONCE:BODY (empty body for GET), keyed with the secret.
const signature = createHmac("sha256", secret).update(`${id}:${timestamp}:${nonce}:`).digest("hex");

const res = await fetch(base + path, {
  headers: {
    "X-Auth-Client": id,
    "X-Auth-Timestamp": timestamp,
    "X-Auth-Nonce": nonce,
    "X-Auth-Signature": signature,
  },
});
const body = await res.json().catch(() => null);
console.log("status:", res.status, "| correlation id:", res.headers.get("x-correlation-id"));

const accounts = body?.data?.accounts;
if (Array.isArray(accounts)) {
  console.table(
    accounts.map((a) => ({ currency: a.currency, available: a.available_balance_formatted, ledger: a.ledger_balance_formatted })),
  );
} else {
  console.log(JSON.stringify(body, null, 2));
}
