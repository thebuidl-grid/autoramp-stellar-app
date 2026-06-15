import {
  Contract,
  nativeToScVal,
  xdr,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
} from "@stellar/stellar-sdk";
import { CCTP_CONTRACTS, STELLAR_RPC, STELLAR_NETWORK_PASSPHRASE } from "./constants";
import { toStellarStroops, toCctpAmount } from "./decimals";
import type { StellarCctpConfig, BurnParams, BurnResult } from "./types";

/**
 * Burns USDC on Stellar, emitting a CCTP message to the destination chain.
 *
 * Uses `TokenMessengerMinter.deposit_for_burn` on the Soroban contract.
 * After this call succeeds, poll `waitForAttestation` with the returned
 * `messageHash` then redeem on the destination chain.
 *
 * @param config   Stellar network config and signer keypair
 * @param params   Amount, destination domain, and recipient address
 */
export async function burnUsdcOnStellar(
  config: StellarCctpConfig,
  params: BurnParams,
): Promise<BurnResult> {
  const { network, keypair, rpcUrl } = config;
  const contracts = CCTP_CONTRACTS[network];
  const rpc = new SorobanRpc.Server(rpcUrl ?? STELLAR_RPC[network]);
  const networkPassphrase =
    network === "mainnet"
      ? Networks.PUBLIC
      : Networks.TESTNET;

  // Stellar amounts use 7 decimals; CCTP burn amount argument uses 7 decimals
  const burnStroops = toStellarStroops(params.amount);

  // mintRecipient must be a 32-byte big-endian hex value (zero-padded EVM address or Stellar key)
  const recipientHex = params.mintRecipient.replace(/^0x/, "").padStart(64, "0");
  const mintRecipientBytes = Buffer.from(recipientHex, "hex");

  if (mintRecipientBytes.length !== 32) {
    throw new Error(
      `mintRecipient must be 32 bytes when hex-decoded, got ${mintRecipientBytes.length}`,
    );
  }

  const contract = new Contract(contracts.tokenMessengerMinter);
  const usdcAddress = new Address(contracts.usdc);

  const callArgs = [
    // amount: i128
    nativeToScVal(burnStroops, { type: "i128" }),
    // destination_domain: u32
    nativeToScVal(params.destinationDomain, { type: "u32" }),
    // mint_recipient: Bytes (32 bytes, big-endian)
    xdr.ScVal.scvBytes(mintRecipientBytes),
    // burn_token: Address (USDC contract)
    usdcAddress.toScVal(),
  ];

  const account = await rpc.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("deposit_for_burn", ...callArgs))
    .setTimeout(30)
    .build();

  const simResult = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(keypair);

  const sendResult = await rpc.sendTransaction(preparedTx);
  if (sendResult.status === "ERROR") {
    throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const txHash = sendResult.hash;
  const { message, messageHash, nonce } = await extractBurnEventFromTx(
    rpc,
    txHash,
  );

  return { txHash, message, messageHash, nonce };
}

/**
 * Polls the Stellar RPC until the transaction is confirmed, then extracts the
 * CCTP message and nonce emitted by the MessageTransmitter contract.
 */
async function extractBurnEventFromTx(
  rpc: SorobanRpc.Server,
  txHash: string,
): Promise<{ message: string; messageHash: string; nonce: bigint }> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await rpc.getTransaction(txHash);

    if (result.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      await sleep(2_000);
      continue;
    }

    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction ${txHash} failed on-chain`);
    }

    // SUCCESS — parse emitted events for the MessageSent event
    const events: xdr.DiagnosticEvent[] =
      (result as any).resultMetaXdr
        ?.v3()
        ?.sorobanMeta()
        ?.events() ?? [];

    for (const event of events) {
      const body = event.event?.().body();
      if (!body) continue;
      const v0 = body.v0?.();
      if (!v0) continue;

      const topicStrings = v0.topics().map((t: xdr.ScVal) =>
        t.bytes?.()?.toString("hex") ?? t.sym?.(),
      );

      // MessageTransmitter emits a "MessageSent" event with the raw message bytes
      if (topicStrings.some((t: string | undefined) => t === "MessageSent")) {
        const messageBytes: Buffer = v0.data().bytes();
        const message = messageBytes.toString("hex");
        const messageHash = computeKeccak256(messageBytes);
        // Nonce is embedded in the message at bytes 12-20 (big-endian uint64)
        const nonce = messageBytes.readBigUInt64BE(12);
        return { message, messageHash, nonce };
      }
    }

    throw new Error(`No MessageSent event found in transaction ${txHash}`);
  }
}

function computeKeccak256(data: Buffer): string {
  // Use the keccak256 bundled with stellar-sdk via ethereumjs dependencies
  // If not available, consumers can substitute their own hash implementation.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { keccak256 } = require("viem");
    return keccak256(`0x${data.toString("hex")}`);
  } catch {
    throw new Error(
      "keccak256 not available — install viem or provide a custom hash function",
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
