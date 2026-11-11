import { NextRequest, NextResponse } from "next/server";
import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { STELLAR_CCTP_DOMAIN, STELLAR_CCTP_FORWARDER } from "@/lib/cctp-stellar";

/**
 * Relays a CCTP burn to Stellar: waits for Circle's attestation, then submits
 * CctpForwarder.mint_and_forward (publicly callable; the relayer only pays fees,
 * funds go to the recipient encoded in the burn's hook data).
 *
 * Needs STELLAR_RELAYER_SECRET (a funded Stellar account secret, server-side only).
 * Mainnet also needs STELLAR_SOROBAN_RPC_URL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const minted = new Map<string, string>(); // burnTx -> stellar tx hash
const inflight = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry infrastructure hiccups (RPC briefly not seeing an account, timeouts, 429/5xx).
 * Contract-level rejections (e.g. a replayed message) are final and never retried.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : "";
      const transient = /not found|timeout|timed out|fetch failed|ECONN|ENOTFOUND|\b(429|502|503|504)\b|try again/i.test(msg);
      if (!transient || /Contract, #/.test(msg)) throw e;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

async function mintAndForward(
  network: "testnet" | "mainnet",
  message: string,
  attestation: string,
): Promise<string> {
  const secret = process.env.STELLAR_RELAYER_SECRET;
  if (!secret) throw new Error("Relayer not configured (STELLAR_RELAYER_SECRET)");
  const rpcUrl =
    process.env.STELLAR_SOROBAN_RPC_URL ||
    (network === "testnet" ? "https://soroban-testnet.stellar.org" : "");
  if (!rpcUrl) throw new Error("Set STELLAR_SOROBAN_RPC_URL for mainnet");

  const kp = Keypair.fromSecret(secret);
  const server = new rpc.Server(rpcUrl);
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: network === "testnet" ? Networks.TESTNET : Networks.PUBLIC,
  })
    .addOperation(
      new Contract(STELLAR_CCTP_FORWARDER[network]).call(
        "mint_and_forward",
        xdr.ScVal.scvBytes(Buffer.from(message.replace(/^0x/, ""), "hex")),
        xdr.ScVal.scvBytes(Buffer.from(attestation.replace(/^0x/, ""), "hex")),
      ),
    )
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Mint simulation failed: ${sim.error}`);
  }
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error("Stellar rejected the mint transaction");

  let res = await server.getTransaction(sent.hash);
  for (let i = 0; res.status === "NOT_FOUND" && i < 45; i++) {
    await sleep(2000);
    res = await server.getTransaction(sent.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`Stellar mint failed (${res.status})`);
  return sent.hash;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const burnTxHash: unknown = body?.burnTxHash;
  const sourceDomain: unknown = body?.sourceDomain;
  const network: unknown = body?.network;

  if (typeof burnTxHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(burnTxHash)) {
    return NextResponse.json({ error: "Invalid burnTxHash" }, { status: 400 });
  }
  if (!Number.isInteger(sourceDomain) || (sourceDomain as number) < 0) {
    return NextResponse.json({ error: "Invalid sourceDomain" }, { status: 400 });
  }
  if (network !== "testnet" && network !== "mainnet") {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }

  const done = minted.get(burnTxHash);
  if (done) return NextResponse.json({ status: "complete", mintTxHash: done });
  if (inflight.has(burnTxHash)) return NextResponse.json({ status: "minting" });

  const iris =
    network === "testnet"
      ? "https://iris-api-sandbox.circle.com"
      : "https://iris-api.circle.com";
  let msg: {
    status?: string;
    message?: string;
    attestation?: string;
    decodedMessage?: { destinationDomain?: string };
  } | undefined;
  try {
    const r = await fetch(`${iris}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (r.ok) msg = (await r.json())?.messages?.[0];
  } catch {
    // transient Iris failure: report pending and let the client poll again
  }
  if (!msg || msg.status !== "complete" || !msg.message || !msg.attestation) {
    return NextResponse.json({ status: msg?.status ?? "pending" });
  }
  // Only relay burns that are actually destined for Stellar.
  if (String(msg.decodedMessage?.destinationDomain) !== String(STELLAR_CCTP_DOMAIN)) {
    return NextResponse.json({ error: "Burn is not destined for Stellar" }, { status: 400 });
  }

  inflight.add(burnTxHash);
  try {
    const mintTxHash = await withRetry(() => mintAndForward(network, msg.message!, msg.attestation!));
    minted.set(burnTxHash, mintTxHash);
    return NextResponse.json({ status: "complete", mintTxHash });
  } catch (e) {
    // First line only: Soroban simulation errors embed a huge diagnostic log.
    const error = (e instanceof Error ? e.message : "Mint failed").split("\n")[0].slice(0, 200);
    return NextResponse.json({ error }, { status: 502 });
  } finally {
    inflight.delete(burnTxHash);
  }
}
