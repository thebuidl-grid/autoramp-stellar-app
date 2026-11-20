/**
 * Manually relay one Stellar -> Base CCTP v2 burn after Circle attests it.
 *
 * Usage:
 *   BASE_RELAYER_PRIVATE_KEY=0x... npx ts-node -r tsconfig-paths/register scripts/relay-stellar-cctp.ts \
 *     --burn-tx <stellar-burn-transaction-hash> --recipient <0x-base-mint-recipient> --network mainnet
 *
 * The key is read only from the environment. A relayer address alone cannot submit a transaction.
 */
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { parseCctpV2BurnMessage } from '../src/modules/ramp/cctp-stellar-relay.util';

const TRANSMITTER: Record<string, string> = {
  mainnet: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  testnet: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
};
const ABI = [
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
  'function usedNonces(bytes32) view returns (uint256)',
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}

async function main() {
  const burnTx = arg('burn-tx');
  const expectedRecipient = arg('recipient')?.toLowerCase();
  const network = arg('network');
  const privateKey = process.env.BASE_RELAYER_PRIVATE_KEY?.trim();
  if (!burnTx || !expectedRecipient || !network || !TRANSMITTER[network]) {
    throw new Error('Required: --burn-tx <hash> --recipient <0x address> --network mainnet|testnet');
  }
  if (!/^0x[0-9a-f]{40}$/.test(expectedRecipient)) throw new Error('Invalid --recipient EVM address');
  if (!privateKey) throw new Error('Set BASE_RELAYER_PRIVATE_KEY in the environment');

  const iris = network === 'mainnet' ? 'https://iris-api.circle.com' : 'https://iris-api-sandbox.circle.com';
  const response = await fetch(`${iris}/v2/messages/27?transactionHash=${encodeURIComponent(burnTx)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Circle Iris returned HTTP ${response.status}`);
  const result = (await response.json()) as any;
  const message = result?.messages?.[0];
  if (message?.status !== 'complete' || !message.message || !message.attestation) {
    throw new Error(`Circle attestation is not complete (status: ${message?.status ?? 'not found'}). Retry later.`);
  }

  const parsed = parseCctpV2BurnMessage(message.message);
  if (parsed.sourceDomain !== 27 || parsed.destinationDomain !== 6) {
    throw new Error(`Wrong CCTP route: source domain ${parsed.sourceDomain}, destination domain ${parsed.destinationDomain}; expected Stellar (27) -> Base (6)`);
  }
  if (parsed.mintRecipient !== expectedRecipient) {
    throw new Error(`Recipient mismatch: message mints to ${parsed.mintRecipient}, requested ${expectedRecipient}; refusing to relay`);
  }

  const provider = new JsonRpcProvider(
    process.env.BASE_RELAYER_RPC_URL?.trim() ||
      (network === 'mainnet' ? 'https://mainnet.base.org' : 'https://sepolia.base.org'),
  );
  const wallet = new Wallet(privateKey, provider);
  const requestedWallet = arg('relayer')?.toLowerCase();
  if (requestedWallet && wallet.address.toLowerCase() !== requestedWallet) {
    throw new Error(`Private key is for ${wallet.address}, not requested relayer ${requestedWallet}`);
  }
  console.log(`Network: ${network}; relayer: ${wallet.address}; recipient: ${parsed.mintRecipient}`);
  console.log(`Burn amount: ${parsed.amount} USDC base units; fee: ${parsed.feeExecuted} base units`);

  const transmitter = new Contract(TRANSMITTER[network], ABI, wallet);
  if ((await transmitter.usedNonces(parsed.nonce)) !== 0n) {
    console.log('Already relayed: this CCTP message nonce has been used.');
    return;
  }
  const tx = await transmitter.receiveMessage(message.message, message.attestation);
  console.log(`Submitted Base transaction: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`Relay transaction failed: ${tx.hash}`);
  console.log(`Mint confirmed in block ${receipt.blockNumber}: ${tx.hash}`);
}

main().catch((error) => {
  console.error(`Relay failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
