/**
 * Client flow for EVM -> Stellar USDC over CCTP v2 (see lib/cctp-stellar.ts).
 * The user's wallet signs approve + burn. The Stellar mint is signed by the user's Stellar wallet when one is connected (they pay the
 * fee); if that wallet is missing, closed or fails, the server relay submits it, so the transfer is never left stuck.
 */
import { writeContract, waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi-config";
import { rpc, xdr } from "@stellar/stellar-sdk";
import { invokeSoroban, stellarConfig } from "@/lib/cctp-stellar-source";
import { bridgeApi } from "@/lib/api";
import { completeMint, pollRelay } from "@/lib/cctp-complete";
import { IS_TESTNET } from "@/lib/constants/networks";
import {
  CCTP_FAST_FINALITY,
  CCTP_MAX_FEE,
  CCTP_SOURCE_DOMAIN,
  DEPOSIT_FOR_BURN_WITH_HOOK_ABI,
  STELLAR_CCTP_DOMAIN,
  STELLAR_CCTP_FORWARDER,
  buildForwarderHookData,
  contractStrkeyToBytes32,
} from "@/lib/cctp-stellar";

const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type CctpStellarStage =
  | "approving"
  | "burning"
  | "attesting"
  | "minting"
  | "done";

export interface BridgeEvmToStellarParams {
  chainId: number;
  /** USDC amount in base units (6 dp). */
  amountBase: string;
  /** Stellar G… account that receives the USDC. */
  stellarRecipient: string;
  usdc: `0x${string}`;
  tokenMessenger: `0x${string}`;
  /** Called as soon as the burn is mined, so the UI/back end can show the hash. */
  onSourceTx?: (hash: string) => void | Promise<void>;
  onStage?: (stage: CctpStellarStage) => void;
  /** Connected Stellar wallet: address + signer. When set, the user submits the mint themselves. */
  stellarWalletAddress?: string;
  stellarSigner?: (xdr: string) => Promise<string>;
  /** Give up waiting for attestation + mint after this long (default 30 min). */
  timeoutMs?: number;
  /** The wallet could not finish the mint (closed, rejected, failed), so our relayer is finishing it. */
  onFallback?: (reason: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function bridgeEvmToStellarViaCctp(
  p: BridgeEvmToStellarParams,
): Promise<{ sourceTxHash: string; destinationTxHash: string }> {
  const network = IS_TESTNET ? "testnet" : "mainnet";
  const sourceDomain = CCTP_SOURCE_DOMAIN[p.chainId];
  if (sourceDomain === undefined) {
    throw new Error(`Chain ${p.chainId} is not a supported CCTP source`);
  }
  // Validate everything that can be validated before any wallet prompt.
  const hookData = buildForwarderHookData(p.stellarRecipient);
  const forwarder = contractStrkeyToBytes32(STELLAR_CCTP_FORWARDER[network]);
  const amount = BigInt(p.amountBase);

  p.onStage?.("approving");
  const approveHash = await writeContract(wagmiConfig, {
    address: p.usdc,
    abi: APPROVE_ABI,
    functionName: "approve",
    args: [p.tokenMessenger, amount],
    chainId: p.chainId,
  } as never);
  await waitForTransactionReceipt(wagmiConfig, { hash: approveHash, chainId: p.chainId });

  p.onStage?.("burning");
  const burnHash = await writeContract(wagmiConfig, {
    address: p.tokenMessenger,
    abi: DEPOSIT_FOR_BURN_WITH_HOOK_ABI,
    functionName: "depositForBurnWithHook",
    args: [
      amount,
      STELLAR_CCTP_DOMAIN,
      forwarder, // mintRecipient = CctpForwarder
      p.usdc,
      forwarder, // destinationCaller = CctpForwarder
      CCTP_MAX_FEE,
      CCTP_FAST_FINALITY,
      hookData,
    ],
    chainId: p.chainId,
  } as never);
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: burnHash, chainId: p.chainId });
  if (receipt.status !== "success") throw new Error("Burn transaction reverted");
  await p.onSourceTx?.(burnHash);

  p.onStage?.("attesting");
  const window = p.timeoutMs ?? 30 * 60_000;
  const hasWallet = !!(p.stellarSigner && p.stellarWalletAddress);

  // First choice: the user's own Stellar wallet signs the mint (they pay the fee, nothing touches our relayer).
  const walletMint = hasWallet
    ? async () => {
        const deadline = Date.now() + window;
        let att: { message: string; attestation: string } | null = null;
        while (Date.now() < deadline && !att) {
          const r = await fetch(`/api/bridge/attestation?domain=${sourceDomain}&tx=${burnHash}&network=${network}`, { cache: "no-store" });
          const b = (await r.json().catch(() => ({}))) as { status?: string; message?: string; attestation?: string };
          if (b.status === "complete" && b.message && b.attestation) att = { message: b.message, attestation: b.attestation };
          else await sleep(5000);
        }
        if (!att) throw new Error(`Timed out waiting for Circle's attestation. Burn ${burnHash} is safe; funds are not lost.`);
        p.onStage?.("minting");
        const cfg = stellarConfig();
        return invokeSoroban(
          new rpc.Server(cfg.rpcUrl),
          cfg.passphrase,
          p.stellarWalletAddress!,
          STELLAR_CCTP_FORWARDER[network],
          "mint_and_forward",
          [
            xdr.ScVal.scvBytes(Buffer.from(att.message.replace(/^0x/, ""), "hex")),
            xdr.ScVal.scvBytes(Buffer.from(att.attestation.replace(/^0x/, ""), "hex")),
          ],
          p.stellarSigner!,
        );
      }
    : undefined;

  // Safety net: if the wallet is closed, rejects, or fails, our relayer finishes the mint so the money is never left stuck.
  const relayMint = () =>
    pollRelay({
      call: async () => (await bridgeApi.relayToStellar({ burnTxHash: burnHash, sourceDomain })).data,
      onMinting: () => p.onStage?.("minting"),
      deadline: Date.now() + window,
    });

  const { hash } = await completeMint({ walletMint, relayMint, onFallback: p.onFallback });
  p.onStage?.("done");
  return { sourceTxHash: burnHash, destinationTxHash: hash };
}
