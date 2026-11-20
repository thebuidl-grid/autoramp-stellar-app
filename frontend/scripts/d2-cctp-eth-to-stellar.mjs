// Real Ethereum Sepolia -> Stellar testnet USDC transfer over Circle CCTP v2 (direct, no Bridge Kit:
// @circle-fin/bridge-kit 1.17.1 has no Stellar support). Every step is a REAL testnet transaction and
// the hashes written to the evidence file are what the D2 demo must show.
//
// Flow (per https://developers.circle.com/cctp/references/stellar):
//   1. EVM  : USDC.approve(TokenMessengerV2)
//   2. EVM  : TokenMessengerV2.depositForBurnWithHook(destDomain=27, mintRecipient=destinationCaller=CctpForwarder,
//             hookData = forwardRecipient G-address)
//   3. Iris : poll attestation for the burn tx
//   4. Stellar (Soroban): CctpForwarder.mint_and_forward(message, attestation) -> USDC lands in the G account
//
//   DEMO_WALLET_FILE=/path/wallet.json node scripts/d2-cctp-eth-to-stellar.mjs setup
//   DEMO_WALLET_FILE=... node scripts/d2-cctp-eth-to-stellar.mjs balances
//   DEMO_WALLET_FILE=... node scripts/d2-cctp-eth-to-stellar.mjs bridge 5.00
//   DEMO_WALLET_FILE=... node scripts/d2-cctp-eth-to-stellar.mjs resume <burnTxHash>   # attestation + mint only
//
// wallet.json = { evm: { address, privateKey }, stellar: { address, secret } }  (never commit it)

import fs from "node:fs";
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, parseAbi, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { Asset, BASE_FEE, Contract, Horizon, Keypair, Networks, Operation, StrKey, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";

const walletFile = process.env.DEMO_WALLET_FILE;
if (!walletFile) throw new Error("Set DEMO_WALLET_FILE to a wallet.json path");
const wallet = JSON.parse(fs.readFileSync(walletFile, "utf8"));
const EVIDENCE = process.env.DEMO_EVIDENCE_FILE || "demo_assets_d2/evidence.json";

// ---- Ethereum Sepolia (source, CCTP domain 0) ----
const SOURCE_DOMAIN = 0;
const ETH_RPC = process.env.RPC_ETHEREUM_SEPOLIA || "https://ethereum-sepolia-rpc.publicnode.com";
const ETH_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const TOKEN_MESSENGER_V2 = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
// ---- Stellar testnet (destination, CCTP domain 27) ----
const STELLAR_DOMAIN = 27;
const CCTP_FORWARDER = "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ";
const SOROBAN_RPC = "https://soroban-testnet.stellar.org";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const MIN_FINALITY = 1000; // fast transfer
const MAX_FEE = 5000n; // 0.005 USDC ceiling

const pub = createPublicClient({ chain: sepolia, transport: http(ETH_RPC) });
const evmAccount = privateKeyToAccount(wallet.evm.privateKey);
const walletClient = createWalletClient({ account: evmAccount, chain: sepolia, transport: http(ETH_RPC) });
const stellarKp = Keypair.fromSecret(wallet.stellar.secret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function hookDataFor(recipientStrkey) {
  if (!StrKey.isValidEd25519PublicKey(recipientStrkey)) throw new Error("forward recipient must be a G… account");
  const rb = Buffer.from(recipientStrkey, "utf8");
  const b = Buffer.alloc(32 + rb.length);
  b.writeUInt32BE(0, 24); // version
  b.writeUInt32BE(rb.length, 28); // recipient length
  rb.copy(b, 32);
  return `0x${b.toString("hex")}`;
}
const forwarderBytes32 = () => `0x${Buffer.from(StrKey.decodeContract(CCTP_FORWARDER)).toString("hex")}`;

async function balances() {
  const eth = await pub.getBalance({ address: evmAccount.address });
  const usdc = await pub.readContract({ address: ETH_USDC, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [evmAccount.address] });
  let acct;
  for (let i = 0; i < 4 && !acct; i++) { // Horizon occasionally fails transiently; never report that as a zero balance
    try { acct = await horizon.loadAccount(stellarKp.publicKey()); } catch (e) { if (i === 3) throw e; await sleep(1500); }
  }
  const line = acct?.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER);
  const out = {
    ethereum_sepolia: { address: evmAccount.address, eth: formatUnits(eth, 18), usdc: formatUnits(usdc, 6) },
    stellar_testnet: { address: stellarKp.publicKey(), xlm: acct?.balances.find((b) => b.asset_type === "native")?.balance ?? null, usdc_trustline: !!line, usdc: line?.balance ?? "0" },
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function setup() {
  const acct = await horizon.loadAccount(stellarKp.publicKey());
  if (acct.balances.some((b) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER)) return console.log("USDC trustline already present");
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(Operation.changeTrust({ asset: new Asset("USDC", USDC_ISSUER) })).setTimeout(60).build();
  tx.sign(stellarKp);
  console.log("Trustline tx:", (await horizon.submitTransaction(tx)).hash);
}

function saveEvidence(patch) {
  fs.mkdirSync("demo_assets_d2", { recursive: true });
  const cur = fs.existsSync(EVIDENCE) ? JSON.parse(fs.readFileSync(EVIDENCE, "utf8")) : {};
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  fs.writeFileSync(EVIDENCE, JSON.stringify(next, null, 2));
  return next;
}

async function burn(amountStr) {
  const amount = parseUnits(amountStr, 6);
  const before = await balances();
  if (parseUnits(before.ethereum_sepolia.usdc, 6) < amount) throw new Error(`Need >= ${amountStr} USDC on Ethereum Sepolia`);
  if (Number(before.ethereum_sepolia.eth) === 0) throw new Error("Need Sepolia ETH for gas");
  if (!before.stellar_testnet.usdc_trustline) throw new Error("Run `setup` first (Stellar USDC trustline)");

  log("approve USDC -> TokenMessengerV2");
  const approveTx = await walletClient.writeContract({ address: ETH_USDC, abi: parseAbi(["function approve(address,uint256) returns (bool)"]), functionName: "approve", args: [TOKEN_MESSENGER_V2, amount] });
  await pub.waitForTransactionReceipt({ hash: approveTx });
  log("approve tx", approveTx);

  log("depositForBurnWithHook -> Stellar (domain 27) via CctpForwarder");
  const abi = parseAbi(["function depositForBurnWithHook(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData)"]);
  const fwd = forwarderBytes32();
  const { request } = await pub.simulateContract({ // free dry-run: reverts here cost nothing
    account: evmAccount, address: TOKEN_MESSENGER_V2, abi, functionName: "depositForBurnWithHook",
    args: [amount, STELLAR_DOMAIN, fwd, ETH_USDC, fwd, MAX_FEE, MIN_FINALITY, hookDataFor(stellarKp.publicKey())],
  });
  log("burn simulation OK");
  const burnTx = await walletClient.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash: burnTx });
  log("burn tx", burnTx, "status", receipt.status);
  if (receipt.status !== "success") throw new Error("burn reverted");
  saveEvidence({
    amount_usdc: amountStr, source_chain: "Ethereum Sepolia (CCTP domain 0)", destination_chain: "Stellar testnet (CCTP domain 27)",
    source_wallet: evmAccount.address, stellar_recipient: stellarKp.publicKey(), cctp_forwarder: CCTP_FORWARDER,
    approve_tx: approveTx, source_burn_tx: burnTx, source_burn_url: `https://sepolia.etherscan.io/tx/${burnTx}`,
    burn_block: Number(receipt.blockNumber), balances_before: before,
  });
  return burnTx;
}

async function attestation(burnTx) {
  const url = `https://iris-api-sandbox.circle.com/v2/messages/${SOURCE_DOMAIN}?transactionHash=${burnTx}`;
  const t0 = Date.now();
  while (Date.now() - t0 < 30 * 60_000) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const m = (await r.json())?.messages?.[0];
        if (m?.status === "complete") { log("attestation complete"); return m; }
        log("attestation status:", m?.status ?? "pending");
      } else if (r.status !== 404) log("iris", r.status);
    } catch (e) { log("iris error", e.message); }
    await sleep(5000);
  }
  throw new Error("Attestation timed out (burn tx is safe; run `resume <burnTx>`)");
}

async function mintAndForward(att) {
  const server = new rpc.Server(SOROBAN_RPC);
  const account = await server.getAccount(stellarKp.publicKey());
  const tx = new TransactionBuilder(account, { fee: "10000000", networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(CCTP_FORWARDER).call("mint_and_forward",
      xdr.ScVal.scvBytes(Buffer.from(att.message.replace("0x", ""), "hex")),
      xdr.ScVal.scvBytes(Buffer.from(att.attestation.replace("0x", ""), "hex"))))
    .setTimeout(120).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error("Simulation failed: " + JSON.stringify(sim));
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(stellarKp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error("Send failed: " + JSON.stringify(sent));
  let res = await server.getTransaction(sent.hash);
  while (res.status === "NOT_FOUND") { await sleep(2000); res = await server.getTransaction(sent.hash); }
  if (res.status !== "SUCCESS") throw new Error("mint_and_forward failed: " + JSON.stringify(res));
  log("mint_and_forward tx", sent.hash);
  return { hash: sent.hash, ledger: res.ledger };
}

async function finish(burnTx) {
  const att = await attestation(burnTx);
  const mint = await mintAndForward(att);
  const after = await balances();
  const ev = saveEvidence({
    state: "success", stellar_mint_tx: mint.hash, stellar_mint_ledger: mint.ledger,
    stellar_mint_url: `https://stellar.expert/explorer/testnet/tx/${mint.hash}`, balances_after: after,
  });
  console.log("\n=== EVIDENCE ===\n" + JSON.stringify({ burn: ev.source_burn_url, mint: ev.stellar_mint_url, stellar_usdc: after.stellar_testnet.usdc }, null, 2));
  console.log("Saved:", EVIDENCE);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "balances") await balances();
  else if (cmd === "setup") await setup();
  else if (cmd === "bridge") await finish(await burn(arg || "5.00"));
  else if (cmd === "resume") await finish(arg);
  else console.log("usage: setup | balances | bridge <amount> | resume <burnTxHash>");
} catch (e) { console.error("FAILED:", e.message); saveEvidence({ state: "error", error: e.message }); process.exit(1); }
