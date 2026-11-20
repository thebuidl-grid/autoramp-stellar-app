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
import { bridgeApi } from "@/lib/api";
import { completeMint, pollRelay } from "@/lib/cctp-complete";
import { explainStellarAccountError, parseRelayBridge } from "@/lib/stellar-offramp-relay";
import { checkStellarFunds, fetchStellarFunds } from "@/lib/stellar-balance";
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
  /** The wallet could not finish the mint (closed, rejected, failed), so our relayer is finishing it. */
  onFallback?: (reason: string) => void;
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
  let account;
  try {
    account = await server.getAccount(source);
  } catch (error) {
    throw explainStellarAccountError(error, IS_TESTNET ? "testnet" : "mainnet") ?? error;
  }
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

export interface BurnStellarUsdcParams {
  /** Connected Stellar account (G…) that owns the USDC. */
  stellarAddress: string;
  /** USDC to burn, in Stellar base units (7 dp). */
  amountUnits: bigint;
  /** Fee ceiling for the fast transfer, in Stellar base units (7 dp). */
  maxFeeUnits: bigint;
  /** CCTP destination domain (e.g. 6 = Base). */
  destDomain: number;
  /** 32-byte mint recipient on the destination chain. */
  mintRecipient: Buffer;
  signXdr: (xdr: string) => Promise<string>;
  onStage?: (stage: "approving" | "burning") => void;
}

/** Setup shared by the two Soroban calls of a burn. */
function burnContext(p: BurnStellarUsdcParams) {
  const cfg = stellarConfig();
  return {
    cfg,
    tokenMessenger: STELLAR_TOKEN_MESSENGER_MINTER[cfg.network],
    server: new rpc.Server(cfg.rpcUrl),
    from: new Address(p.stellarAddress).toScVal(),
  };
}

/**
 * Step 1 of the Stellar burn: USDC.approve(TokenMessengerMinter). One wallet prompt. Checks the wallet can cover
 * the burn first, so the user never signs an approval for a burn that is certain to fail.
 */
export async function approveStellarUsdcForCctp(p: BurnStellarUsdcParams): Promise<string> {
  const { cfg, tokenMessenger, server, from } = burnContext(p);

  // Approving never checks the balance, so without this the user signs the approval and only then hits
  // "deposit_for_burn failed in simulation".
  const funds = await fetchStellarFunds(p.stellarAddress);
  if (funds) {
    const check = checkStellarFunds(funds, p.amountUnits);
    if (!check.ok) throw new Error(check.message);
  }

  p.onStage?.("approving");
  const expiration = (await server.getLatestLedger()).sequence + 2000;
  return invokeSoroban(server, cfg.passphrase, p.stellarAddress, cfg.usdcContract, "approve", [
    from,
    new Address(tokenMessenger).toScVal(),
    nativeToScVal(p.amountUnits, { type: "i128" }),
    nativeToScVal(expiration, { type: "u32" }),
  ], p.signXdr);
}

/**
 * Step 2: TokenMessengerMinter.deposit_for_burn(...) with fast finality. One wallet prompt. Run it from its own
 * button tap: on a phone the wallet app only comes to the front for a request the user just started.
 * Returns the burn transaction hash. The mint on the destination chain is a separate step.
 */
export async function burnStellarUsdcOnly(p: BurnStellarUsdcParams): Promise<string> {
  const { cfg, tokenMessenger, server, from } = burnContext(p);
  p.onStage?.("burning");
  return invokeSoroban(server, cfg.passphrase, p.stellarAddress, tokenMessenger, "deposit_for_burn", [
    from,
    nativeToScVal(p.amountUnits, { type: "i128" }),
    nativeToScVal(p.destDomain, { type: "u32" }),
    xdr.ScVal.scvBytes(p.mintRecipient),
    new Address(cfg.usdcContract).toScVal(),
    xdr.ScVal.scvBytes(Buffer.alloc(32)), // destination_caller: anyone may mint
    nativeToScVal(p.maxFeeUnits, { type: "i128" }),
    nativeToScVal(1000, { type: "u32" }), // fast transfer
  ], p.signXdr);
}

/** Both steps back to back (used by the bridge, which has no phone-return problem to solve here). */
export async function burnStellarUsdcViaCctp(p: BurnStellarUsdcParams): Promise<string> {
  await approveStellarUsdcForCctp(p);
  return burnStellarUsdcOnly(p);
}

function offrampBurnParams(p: {
  stellarAddress: string;
  bridge: unknown;
  signXdr: (xdr: string) => Promise<string>;
  onStage?: (stage: "approving" | "burning") => void;
}): BurnStellarUsdcParams {
  const bridge = parseRelayBridge(p.bridge); // validated before any wallet prompt
  return {
    stellarAddress: p.stellarAddress,
    amountUnits: BigInt(bridge.burnAmountUnits),
    maxFeeUnits: BigInt(bridge.maxFeeUnits),
    destDomain: bridge.destinationDomain,
    mintRecipient: evmAddressToBytes32(bridge.mintRecipient),
    signXdr: p.signXdr,
    onStage: p.onStage,
  };
}

type OfframpStep = Parameters<typeof offrampBurnParams>[0];

/**
 * Stellar off-ramp over CCTP + Base, in two taps. The backend gave the exact burn and the Bitnob Base address; the
 * user never sees or types that address. The Base mint is done by the backend relayer.
 *   tap 1: approveStellarOfframp   tap 2: burnForStellarOfframp
 */
export async function approveStellarOfframp(p: OfframpStep): Promise<string> {
  return approveStellarUsdcForCctp(offrampBurnParams(p));
}

/** Tap 2: the burn itself (run after approveStellarOfframp). Returns the burn transaction hash. */
export async function burnForStellarOfframp(p: OfframpStep): Promise<string> {
  return burnStellarUsdcOnly(offrampBurnParams(p));
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

  const burnHash = await burnStellarUsdcViaCctp({
    stellarAddress: p.stellarAddress,
    amountUnits: amount,
    maxFeeUnits: maxFee,
    destDomain,
    mintRecipient,
    signXdr: p.signXdr,
    onStage: (stage) => p.onStage?.(stage),
  });
  await p.onSourceTx?.(burnHash);

  p.onStage?.("attesting");
  const window = p.timeoutMs ?? 30 * 60_000;

  // First choice: the user's own EVM wallet mints (they pay the destination gas, nothing touches our relayer).
  const walletMint = async () => {
    const deadline = Date.now() + window;
    let att: { message: string; attestation: string } | null = null;
    while (Date.now() < deadline && !att) {
      const r = await fetch(`/api/bridge/attestation?domain=${STELLAR_CCTP_DOMAIN}&tx=${burnHash}&network=${cfg.network}`, { cache: "no-store" });
      const b = (await r.json().catch(() => ({}))) as { status?: string; message?: string; attestation?: string };
      if (b.status === "complete" && b.message && b.attestation) att = { message: b.message, attestation: b.attestation };
      else await sleep(5000);
    }
    if (!att) throw new Error(`Timed out waiting for Circle's attestation. Stellar burn ${burnHash} is safe; the mint can be completed later.`);

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
    return mintHash;
  };

  // Safety net: if the wallet is closed, rejects, or fails, our relayer mints on Base so the money is never left stuck.
  const relayMint = () =>
    pollRelay({
      call: async () => (await bridgeApi.relayToEvm({ burnTxHash: burnHash })).data,
      onMinting: () => p.onStage?.("minting"),
      deadline: Date.now() + window,
    });

  const { hash } = await completeMint({ walletMint, relayMint, onFallback: p.onFallback });
  p.onStage?.("done");
  return { sourceTxHash: burnHash, destinationTxHash: hash };
}
