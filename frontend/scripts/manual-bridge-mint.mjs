// Manual CCTP v2 mint completion helper.
// Given an Ethereum burn tx hash, it fetches Circle's attestation and prints
// the Base receiveMessage transaction data.

const BURN_TX = "0x59b69f849af6ba68442a3bcc7fdca85af715c44d74a13b7e25892e33938007ea";
const MESSAGE_TRANSMITTER_BASE = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const SOURCE_DOMAIN = 0; // Ethereum mainnet

async function main() {
  const irisUrl = `https://iris-api.circle.com/v2/messages/${SOURCE_DOMAIN}?transactionHash=${BURN_TX}`;
  console.log("Iris URL:", irisUrl);
  const irisRes = await fetch(irisUrl);
  const iris = await irisRes.json();

  if (!iris.messages?.[0]?.attestation) {
    console.log("Attestation not ready:", JSON.stringify(iris, null, 2));
    return;
  }

  const { message, attestation } = iris.messages[0];

  console.log("\n=== CCTP Attestation (ready) ===");
  console.log("message:", message);
  console.log("attestation:", attestation);

  // receiveMessage(message, attestation)
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

  // Minimal manual ABI encoding for receiveMessage(bytes,bytes)
  // Function selector for receiveMessage(bytes,bytes)
  const selector = "0x064e1d2d";
  const encodeBytes = (hex) => {
    // Remove 0x prefix
    const data = hex.startsWith("0x") ? hex.slice(2) : hex;
    const len = (data.length / 2).toString(16).padStart(64, "0");
    const pad = (data.length / 2) % 32;
    const padding = pad === 0 ? "" : "00".repeat(32 - pad);
    return `${len}${data}${padding}`;
  };

  // Arguments: message offset (32), attestation offset (32), message bytes, attestation bytes
  // Each dynamic arg: offset from start of args area to the arg's length+data.
  // Total args area: 2 * 32 = 64 bytes.
  const messageEncoded = encodeBytes(message);
  const attestationEncoded = encodeBytes(attestation);
  const messageOffset = (64).toString(16).padStart(64, "0");
  const attestationOffset = (64 + (messageEncoded.length / 2)).toString(16).padStart(64, "0");

  const data = selector + messageOffset.slice(2) + attestationOffset.slice(2) + messageEncoded + attestationEncoded;

  console.log("\n=== Base receiveMessage tx ===");
  console.log("To:", MESSAGE_TRANSMITTER_BASE);
  console.log("Data:", data);
  console.log("\nSubmit this transaction on Base (chainId 8453) with your wallet to complete the mint.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
