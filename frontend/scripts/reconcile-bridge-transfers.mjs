// Reconcile bridge transfers that are stuck pending or only partly updated.
//
// For the authenticated user's bridge history it works out what really happened
// (via the backend's recorded hashes and Circle's Iris API) and sends the right
// status through POST /bridge/update-hash. Dry run by default.
//
//   API_URL=https://api-autoramp.thebuidl.xyz TOKEN=<user jwt> \
//     node scripts/reconcile-bridge-transfers.mjs --network testnet [--apply] [--stale-min 30]
//
// Rules (only transfers that are not already COMPLETED/FAILED):
//   DESTINATION_TX recorded                    -> DESTINATION_TX COMPLETED
//   no SOURCE_TX and older than --stale-min    -> SOURCE_TX FAILED (burn never happened)
//   SOURCE_TX + Iris attestation complete      -> ATTESTATION PROCESSING (mint still to do:
//                                                 listed as "needs mint", never marked failed)
//   SOURCE_TX + no Iris message after 24h      -> DESTINATION_TX FAILED (burn not attested)
//   anything else                              -> left alone

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const API_URL = (process.env.API_URL || "").replace(/\/$/, "");
const TOKEN = process.env.TOKEN;
const network = opt("network", "testnet");
const staleMs = Number(opt("stale-min", "30")) * 60_000;
const apply = flag("apply");

if (!API_URL || !TOKEN) {
  console.error("Set API_URL and TOKEN (a user JWT) in the environment.");
  process.exit(1);
}
if (network !== "testnet" && network !== "mainnet") {
  console.error("--network must be testnet or mainnet");
  process.exit(1);
}

const IRIS = network === "testnet" ? "https://iris-api-sandbox.circle.com" : "https://iris-api.circle.com";
const CCTP_DOMAINS = [0, 6, 5, 27]; // Ethereum, Base, Solana, Stellar
const DAY = 24 * 60 * 60_000;

const api = async (path, init = {}) => {
  const r = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path} -> ${r.status}`);
  return r.json();
};

const isTerminal = (s) => /COMPLETED|SUCCESS|FAILED|ERROR/i.test(s || "");

async function irisMessage(hash) {
  for (const d of CCTP_DOMAINS) {
    try {
      const r = await fetch(`${IRIS}/v2/messages/${d}?transactionHash=${hash}`);
      if (!r.ok) continue;
      const m = (await r.json())?.messages?.[0];
      if (m) return m;
    } catch {}
  }
  return null;
}

const history = await api("/bridge/history");
const rows = history?.transactions ?? history?.data?.transactions ?? [];
console.log(`${rows.length} bridge transfers, mode: ${apply ? "APPLY" : "dry run"}\n`);

const summary = { updated: 0, needsMint: 0, skipped: 0 };

for (const row of rows) {
  if (isTerminal(row.status)) {
    summary.skipped++;
    continue;
  }
  const detail = await api(`/bridge/status/${row.reference}`);
  const meta = detail?.metadata ?? detail?.data?.metadata ?? {};
  const age = Date.now() - new Date(row.createdAt).getTime();

  let update = null;
  if (meta.DESTINATION_TX) {
    update = { step: "DESTINATION_TX", hash: meta.DESTINATION_TX, status: "COMPLETED" };
  } else if (!meta.SOURCE_TX) {
    if (age > staleMs) update = { step: "SOURCE_TX", hash: "", status: "FAILED" };
  } else {
    const m = await irisMessage(meta.SOURCE_TX);
    if (m?.status === "complete") {
      summary.needsMint++;
      console.log(`${row.reference}  needs mint (attested, not minted)  burn ${meta.SOURCE_TX}`);
      if (!meta.ATTESTATION) update = { step: "ATTESTATION", hash: meta.SOURCE_TX, status: "PROCESSING" };
    } else if (!m && age > DAY) {
      update = { step: "DESTINATION_TX", hash: meta.SOURCE_TX, status: "FAILED" };
    }
  }

  if (!update) {
    summary.skipped++;
    continue;
  }
  console.log(`${row.reference}  ${row.status} -> ${update.step} ${update.status}`);
  if (apply) {
    await api("/bridge/update-hash", { method: "POST", body: JSON.stringify({ reference: row.reference, ...update }) });
  }
  summary.updated++;
}

console.log(`\n${apply ? "Updated" : "Would update"} ${summary.updated}, needs mint ${summary.needsMint}, left alone ${summary.skipped}`);
