/**
 * Client flow for Stellar -> EVM USDC over CCTP v2 (Stellar as the *source*).
 * Bridge Kit has no Stellar support, so this runs CCTP directly:
 *   1. Stellar (Soroban): USDC.approve(TokenMessengerMinter)          — signed by the user's Stellar wallet
 *   2. Stellar (Soroban): TokenMessengerMinter.deposit_for_burn(...)  — signed by the user's Stellar wallet
 *   3. Iris: wait for Circle's attestation (via /api/bridge/attestation)
 *   4. EVM: MessageTransmitterV2.receiveMessage(message, attestation) — signed by the user's EVM wallet
 * Spec: https://developers.circle.com/cctp/references/stellar-contracts
 */
import {
  Address,
  Asset,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { parseUnits } from "viem";
import { switchChain, writeContract, waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi-config";
import { IS_TESTNET } from "@/lib/constants/networks";
import {
  CCTP_EVM_DOMAIN,
  EVM_MESSAGE_TRANSMITTER_V2,
  RECEIVE_MESSAGE_ABI,
  STELLAR_CCTP_DOMAIN,
  STELLAR_TOKEN_MESSENGER_MINTER,
  STELLAR_USDC_ISSUER,
  evmAddressToBytes32,
} from "@/lib/cctp-stellar";

export type StellarSourceStage =
  | "approving"
  | "burning"
  | "attesting"
  | "minting"
  | "done";

export interface BridgeStellarToEvmParams {
  /** Connected Stellar account (G…) that owns the USDC. */
  stellarAddress: string;
  /** Human USDC amount, e.g. "2". */
  amount: string;
  /** EVM address (0x…) that receives the USDC. */
  evmRecipient: string;
  /** Destination EVM chain id (e.g. 84532 Base Sepolia). */
  destChainId: number;
  /** Signs a Stellar transaction XDR with the user's wallet; returns the signed XDR. */
  signXdr: (xdr: string) => Promise<string>;
  /** Called when the Stellar burn is confirmed, so the UI/back end can show the hash. */
  onSourceTx?: (hash: string) => void | Promise<void>;
  onStage?: (stage: StellarSourceStage) => void;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstLine = (s: string) => s.split("\n")[0].slice(0, 200);

export function stellarConfig() {
  const network = IS_TESTNET ? "testnet" : "mainnet";
  const passphrase = IS_TESTNET ? Networks.TESTNET : Networks.PUBLIC;
  const rpcUrl =
    process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL ||
    (IS_TESTNET ? "https://soroban-testnet.stellar.org" : "https://mainnet.sorobanrpc.com");
  // USDC's Stellar Asset Contract id is derived from the issuer, not hard-coded.
  const usdcContract = new Asset("USDC", STELLAR_USDC_ISSUER[network]).contractId(passphrase);
  return { network, passphrase, rpcUrl, usdcContract } as const;
}

/** Simulate, sign (user's wallet), submit and confirm one Soroban contract call. */
export async function invokeSoroban(
  server: rpc.Server,
  passphrase: string,
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signXdr: (xdr: string) => Promise<string>,
): Promise<string> {
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, { fee: "10000000", networkPassphrase: passphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(180)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Stellar ${method} failed in simulation: ${firstLine(sim.error)}`);
  }
  const prepared = rpc.assembleTransaction(tx, sim).build();
  const signedXdr = await signXdr(prepared.toXDR());
  const sent = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, passphrase));
  if (sent.status === "ERROR") throw new Error(`Stellar rejected ${method}`);

  let res = await server.getTransaction(sent.hash);
  for (let i = 0; res.status === "NOT_FOUND" && i < 60; i++) {
    await sleep(2000);
    res = await server.getTransaction(sent.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`Stellar ${method} did not succeed (${res.status})`);
  return sent.hash;
}

export async function bridgeStellarToEvmViaCctp(
  p: BridgeStellarToEvmParams,
): Promise<{ sourceTxHash: string; destinationTxHash: string }> {
  const cfg = stellarConfig();
  const destDomain = CCTP_EVM_DOMAIN[p.destChainId];
  if (destDomain === undefined) throw new Error(`Chain ${p.destChainId} is not a supported CCTP destination`);

  // Validate before any wallet prompt.
  const mintRecipient = evmAddressToBytes32(p.evmRecipient);
  const amount = parseUnits(p.amount, 7); // Stellar USDC has 7 decimals
  const maxFee = BigInt(50_000); // 0.005 USDC (7 dp)
  const tokenMessenger = STELLAR_TOKEN_MESSENGER_MINTER[cfg.network];

  const server = new rpc.Server(cfg.rpcUrl);
  const from = new Address(p.stellarAddress).toScVal();

  p.onStage?.("approving");
  const expiration = (await server.getLatestLedger()).sequence + 2000;
  await invokeSoroban(server, cfg.passphrase, p.stellarAddress, cfg.usdcContract, "approve", [
    from,
    new Address(tokenMessenger).toScVal(),
    nativeToScVal(amount, { type: "i128" }),
    nativeToScVal(expiration, { type: "u32" }),
  ], p.signXdr);

  p.onStage?.("burning");
  const burnHash = await invokeSoroban(server, cfg.passphrase, p.stellarAddress, tokenMessenger, "deposit_for_burn", [
    from,
    nativeToScVal(amount, { type: "i128" }),
    nativeToScVal(destDomain, { type: "u32" }),
    xdr.ScVal.scvBytes(mintRecipient),
    new Address(cfg.usdcContract).toScVal(),
    xdr.ScVal.scvBytes(Buffer.alloc(32)), // destination_caller: anyone may mint
    nativeToScVal(maxFee, { type: "i128" }),
    nativeToScVal(1000, { type: "u32" }), // fast transfer
  ], p.signXdr);
  await p.onSourceTx?.(burnHash);

  p.onStage?.("attesting");
  const deadline = Date.now() + (p.timeoutMs ?? 30 * 60_000);
  let att: { message: string; attestation: string } | null = null;
  while (Date.now() < deadline && !att) {
    const r = await fetch(
      `/api/bridge/attestation?domain=${STELLAR_CCTP_DOMAIN}&tx=${burnHash}&network=${cfg.network}`,
      { cache: "no-store" },
    );
    const b = (await r.json().catch(() => ({}))) as { status?: string; message?: string; attestation?: string };
    if (b.status === "complete" && b.message && b.attestation) att = { message: b.message, attestation: b.attestation };
    else await sleep(5000);
  }
  if (!att) {
    throw new Error(`Timed out waiting for Circle's attestation. Stellar burn ${burnHash} is safe; the mint can be completed later.`);
  }

  p.onStage?.("minting");
  await switchChain(wagmiConfig, { chainId: p.destChainId } as never);
  const mintHash = await writeContract(wagmiConfig, {
    address: EVM_MESSAGE_TRANSMITTER_V2[cfg.network],
    abi: RECEIVE_MESSAGE_ABI,
    functionName: "receiveMessage",
    args: [att.message as `0x${string}`, att.attestation as `0x${string}`],
    chainId: p.destChainId,
  } as never);
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: mintHash, chainId: p.destChainId });
  if (receipt.status !== "success") throw new Error("Mint transaction reverted on the destination chain");

  p.onStage?.("done");
  return { sourceTxHash: burnHash, destinationTxHash: mintHash };
}
