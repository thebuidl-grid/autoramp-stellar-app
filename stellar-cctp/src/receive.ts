import {
  Contract,
  xdr,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { CCTP_CONTRACTS, STELLAR_RPC } from "./constants";
import { fromStellarStroops } from "./decimals";
import { decodeCctpForwarderHookData } from "./hook-data";
import type { StellarCctpConfig, ReceiveParams, ReceiveResult } from "./types";

/**
 * Claims USDC on Stellar by calling CctpForwarder.mint_and_forward.
 *
 * This is a permissionless operation — any party can submit the attested
 * CCTP message and the funds go atomically to the encoded recipient.
 *
 * Typical flow:
 *   1. EVM sender calls depositForBurnWithHook with CctpForwarder as
 *      mintRecipient AND destinationCaller, plus hookData encoding the
 *      Stellar strkey recipient (see buildCctpForwarderHookData).
 *   2. Wait for Circle attestation via waitForAttestation.
 *   3. Call this function with the raw message and attestation bytes.
 *
 * @param config  Stellar network config + signer keypair (pays the fee)
 * @param params  Raw CCTP message hex and Circle attestation hex
 */
export async function receiveCctpMessage(
  config: StellarCctpConfig,
  params: ReceiveParams,
): Promise<ReceiveResult> {
  const { network, keypair, rpcUrl } = config;
  const contracts = CCTP_CONTRACTS[network];
  const rpc = new SorobanRpc.Server(rpcUrl ?? STELLAR_RPC[network]);
  const networkPassphrase =
    network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

  const messageBytes = Buffer.from(params.message.replace(/^0x/, ""), "hex");
  const attestationBytes = Buffer.from(
    params.attestation.replace(/^0x/, ""),
    "hex",
  );

  const contract = new Contract(contracts.cctpForwarder);

  const callArgs = [
    // message: Bytes
    xdr.ScVal.scvBytes(messageBytes),
    // attestation: Bytes
    xdr.ScVal.scvBytes(attestationBytes),
  ];

  const account = await rpc.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("mint_and_forward", ...callArgs))
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
  const { recipient, amount } = await extractMintEventFromTx(
    rpc,
    txHash,
    messageBytes,
  );

  return { txHash, recipient, amount };
}

/**
 * Polls the RPC until the transaction confirms, then extracts the
 * recipient address and minted amount.
 */
async function extractMintEventFromTx(
  rpc: SorobanRpc.Server,
  txHash: string,
  originalMessage: Buffer,
): Promise<{ recipient: string; amount: string }> {
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

    // Parse the hook data embedded in the original CCTP message to recover
    // the intended recipient strkey (the forwardRecipient field).
    // CCTP message body starts at byte 116; hook data follows the message body header.
    // We use the decode utility which understands the hook data layout.
    const hookDataHex = extractHookDataFromMessage(originalMessage);
    const recipient = decodeCctpForwarderHookData(hookDataHex);

    // Extract the CCTP amount from the message (bytes 68-84, u256 big-endian)
    // Standardised on 6 decimals in the wire format; Stellar mints amount × 10.
    const cctpAmount = originalMessage.readBigUInt64BE(76); // simplified read
    const mintedStroops = cctpAmount * 10n;
    const amount = fromStellarStroops(mintedStroops);

    return { recipient, amount };
  }
}

/**
 * Extracts hook data bytes from a raw CCTP message buffer.
 *
 * CCTP message layout (simplified):
 *   0-3    version (u32)
 *   4-7    sourceDomain (u32)
 *   8-11   destinationDomain (u32)
 *   12-19  nonce (u64)
 *   20-51  sender (bytes32)
 *   52-83  recipient (bytes32)
 *   84-115 destinationCaller (bytes32)
 *   116+   messageBody (variable)
 *
 * The messageBody for depositForBurnWithHook starts with a standard header
 * followed by the hookData.  We return the raw hex from byte 116 onward
 * so the decode utility can extract the forwardRecipient.
 */
function extractHookDataFromMessage(message: Buffer): string {
  if (message.length < 116) {
    throw new Error("CCTP message too short to contain hook data");
  }
  // The messageBody begins at offset 116.
  // For depositForBurnWithHook the hook data is appended after the 84-byte
  // BurnMessage header (version u32, burnToken bytes32, mintRecipient bytes32,
  // amount u256, messageSender bytes32).
  const hookDataStart = 116 + 84;
  return message.slice(hookDataStart).toString("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
