#!/usr/bin/env node
// Recover a confirmed Base -> Stellar CCTP v2 transfer.
// Dry run (including Soroban simulation) is the default. Add --submit to sign
// and submit mint_and_forward using a separately funded Stellar relayer key.
//
//   STELLAR_RELAYER_SECRET=S... node scripts/relay-base-to-stellar.mjs \
//     --tx 0x... [--submit]

import {
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const submit = args.includes("--submit");
const txHash = option("--tx") ?? "0x612ea7c0ec7f0ce7fe5b6b3414418758c9da0de78e43bf02dd0ad81fce917f92";
const secret = process.env.STELLAR_RELAYER_SECRET;
const sourceDomain = 6; // Base mainnet CCTP domain
const destinationDomain = 27; // Stellar CCTP domain
const forwarder = "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T";
const stellarTokenMessengerMinter = "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL";

if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
  throw new Error("--tx must be a 0x-prefixed 32-byte transaction hash");
}
if (submit && !secret) {
  throw new Error("Set STELLAR_RELAYER_SECRET in the environment before using --submit");
}
if (!submit && !secret && !process.env.STELLAR_RELAYER_ADDRESS) {
  throw new Error("Set STELLAR_RELAYER_ADDRESS for simulation, or STELLAR_RELAYER_SECRET to derive it");
}

const irisUrl = `https://iris-api.circle.com/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
const response = await fetch(irisUrl, { signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`Circle Iris returned HTTP ${response.status}`);
const payload = await response.json();
const messageRecord = payload?.messages?.find((m) => m?.status === "complete" && m?.message && m?.attestation);
if (!messageRecord) {
  const statuses = (payload?.messages ?? []).map((m) => m?.status).filter(Boolean);
  throw new Error(`Circle attestation is not ready (status: ${statuses.join(", ") || "no message"})`);
}

const message = messageRecord.message.replace(/^0x/, "");
if (!/^[0-9a-fA-F]+$/.test(message) || message.length < 248) {
  throw new Error("Circle returned a malformed CCTP message");
}
// CCTP v2 header offsets (bytes): source domain 4, destination domain 8,
// nonce 12..43, sender 44..75, recipient 76..107, caller 108..139,
// finality fields 140..147, message body starts at 148.
const sourceDomainFromMessage = Number.parseInt(message.slice(8, 16), 16);
const destinationDomainFromMessage = Number.parseInt(message.slice(16, 24), 16);
const expectedForwarder = Buffer.from(StrKey.decodeContract(forwarder)).toString("hex").toLowerCase();
const expectedTokenMessenger = Buffer.from(StrKey.decodeContract(stellarTokenMessengerMinter)).toString("hex").toLowerCase();
const headerRecipient = message.slice(152, 216).toLowerCase();
const destinationCaller = message.slice(216, 280).toLowerCase();
// BurnMessageV2 starts at byte 148. mintRecipient is at body offset 36.
const mintRecipient = message.slice((148 + 36) * 2, (148 + 68) * 2).toLowerCase();
// The CCTP v2 burn message hook starts at body offset 228; AutoRamp encodes
// the destination account as UTF-8 after a 32-byte hook header.
const hookStart = (148 + 228) * 2;
const hookRecipientLength = Number.parseInt(message.slice(hookStart + 56, hookStart + 64), 16);
const hookRecipientStart = hookStart + 64;
const destinationAddress = Buffer.from(
  message.slice(hookRecipientStart, hookRecipientStart + hookRecipientLength * 2),
  "hex",
).toString("utf8");
if (sourceDomainFromMessage !== sourceDomain) {
  throw new Error(`Expected a Base-domain message (${sourceDomain}), got domain ${sourceDomainFromMessage}`);
}
if (destinationDomainFromMessage !== destinationDomain) {
  throw new Error(`Expected a Stellar destination (${destinationDomain}), got domain ${destinationDomainFromMessage}`);
}
if (headerRecipient !== expectedTokenMessenger) {
  throw new Error("This message does not target Stellar's mainnet TokenMessengerMinter; refusing to relay");
}
if (destinationCaller !== expectedForwarder || mintRecipient !== expectedForwarder) {
  throw new Error("This message's destinationCaller or mintRecipient is not AutoRamp's Stellar mainnet CctpForwarder; refusing to relay");
}
if (!StrKey.isValidEd25519PublicKey(destinationAddress)) {
  throw new Error("The CCTP hook does not contain a valid Stellar G... destination account");
}

const relayer = secret ? Keypair.fromSecret(secret) : undefined;
const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL || "https://mainnet.sorobanrpc.com";
const server = new rpc.Server(rpcUrl);
const messageBytes = Buffer.from(message, "hex");
const attestationBytes = Buffer.from(messageRecord.attestation.replace(/^0x/, ""), "hex");
const relayerAddress = relayer?.publicKey() ?? process.env.STELLAR_RELAYER_ADDRESS;
if (relayer && process.env.STELLAR_RELAYER_ADDRESS && relayer.publicKey() !== process.env.STELLAR_RELAYER_ADDRESS) {
  throw new Error("STELLAR_RELAYER_ADDRESS does not match STELLAR_RELAYER_SECRET");
}
if (!StrKey.isValidEd25519PublicKey(relayerAddress)) {
  throw new Error("Invalid Stellar relayer address. Set STELLAR_RELAYER_ADDRESS to the wallet's actual G... public address (not a secret key, contract C... address, or placeholder).");
}
const account = await server.getAccount(relayerAddress);
const tx = new TransactionBuilder(account, {
  fee: "10000000",
  networkPassphrase: Networks.PUBLIC,
})
  .addOperation(new Contract(forwarder).call(
    "mint_and_forward",
    xdr.ScVal.scvBytes(messageBytes),
    xdr.ScVal.scvBytes(attestationBytes),
  ))
  .setTimeout(180)
  .build();

const simulation = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(simulation)) {
  const simulationDetails = JSON.stringify(simulation.error);
  if (simulationDetails.includes("trustline entry is missing for account")) {
    throw new Error(
      `Destination ${destinationAddress} must add a Stellar mainnet USDC trustline (issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN) before this relay can succeed. Simulation did not submit a transaction.`,
    );
  }
  throw new Error(`Soroban simulation rejected mint_and_forward: ${simulation.error}`);
}

console.log(`Base burn: ${txHash}`);
console.log(`CCTP message: Base (${sourceDomain}) -> Stellar (${destinationDomain})`);
console.log(`Forwarder: ${forwarder}`);
console.log(`USDC recipient: ${destinationAddress}`);
console.log(`Relayer: ${relayer?.publicKey() ?? "not set (simulation only)"}`);
console.log("Soroban simulation succeeded.");

if (!submit) {
  console.log("Dry run only. Set STELLAR_RELAYER_SECRET and rerun with --submit to broadcast.");
  process.exit(0);
}

const prepared = rpc.assembleTransaction(tx, simulation).build();
prepared.sign(relayer);
const sent = await server.sendTransaction(prepared);
if (sent.status === "ERROR") throw new Error("Stellar RPC rejected the relayer transaction");
console.log(`Submitted Stellar transaction: ${sent.hash}`);

for (let i = 0; i < 60; i++) {
  const result = await server.getTransaction(sent.hash);
  if (result.status === "SUCCESS") {
    console.log(`Mint-and-forward confirmed: https://stellar.expert/explorer/public/tx/${sent.hash}`);
    process.exit(0);
  }
  if (result.status === "FAILED") throw new Error(`Stellar mint_and_forward failed: ${sent.hash}`);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
throw new Error(`Submitted ${sent.hash}, but confirmation polling timed out; check Stellar Expert before retrying`);
