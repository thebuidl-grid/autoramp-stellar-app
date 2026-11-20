#!/usr/bin/env node
/**
 * Complete a stuck CCTP v2 mint using a wallet derived from a seed phrase.
 *
 * Usage:
 *   WALLET_SEED_PHRASE="twelve word phrase ..." node scripts/complete-mint-with-seed.mjs
 *
 * IMPORTANT: Delete the seed phrase from your shell history / .env after use.
 */

import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";

const BURN_TX =
  "0x59b69f849af6ba68442a3bcc7fdca85af715c44d74a13b7e25892e33938007ea";
const SOURCE_DOMAIN = 0; // Ethereum mainnet
const MESSAGE_TRANSMITTER_BASE =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const EXPECTED_RECIPIENT =
  "0x24d424e226f5f959a9b058ced24b71a982890d6f";

async function main() {
  const seedPhrase = process.env.WALLET_SEED_PHRASE;
  if (!seedPhrase) {
    console.error("Set WALLET_SEED_PHRASE before running this script.");
    process.exit(1);
  }

  const account = mnemonicToAccount(seedPhrase);
  console.log("Derived wallet:", account.address);

  if (account.address.toLowerCase() !== EXPECTED_RECIPIENT.toLowerCase()) {
    console.warn(
      "Warning: derived address does NOT match the mint recipient.\n" +
        `Mint recipient: ${EXPECTED_RECIPIENT}\n` +
        `Derived wallet: ${account.address}`
    );
  }

  const client = createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log("Fetching Circle attestation for burn tx", BURN_TX);
  const irisUrl = `https://iris-api.circle.com/v2/messages/${SOURCE_DOMAIN}?transactionHash=${BURN_TX}`;
  const iris = await (await fetch(irisUrl)).json();
  const msg = iris.messages?.[0];
  if (!msg?.attestation) {
    console.error("Attestation not ready:", JSON.stringify(iris, null, 2));
    process.exit(1);
  }
  const { message, attestation } = msg;

  console.log("Submitting receiveMessage on Base...");
  const abi = [
    {
      type: "function",
      name: "receiveMessage",
      stateMutability: "nonpayable",
      inputs: [
        { type: "bytes", name: "message" },
        { type: "bytes", name: "attestation" },
      ],
      outputs: [{ type: "bool", name: "" }],
    },
  ];

  const txHash = await client.writeContract({
    address: MESSAGE_TRANSMITTER_BASE,
    abi,
    functionName: "receiveMessage",
    args: [message, attestation],
    chain: base,
  });

  console.log("Submitted. Tx hash:", txHash);
  console.log("Track on BaseScan: https://basescan.org/tx/" + txHash);
  console.log("\nNow remove WALLET_SEED_PHRASE from your environment.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
