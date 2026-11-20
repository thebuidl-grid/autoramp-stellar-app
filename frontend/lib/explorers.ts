/** Block-explorer transaction links for the chains the bridge supports. */

/** Chain names look like "Base_Sepolia", "Stellar_Testnet", "Ethereum", "Solana_Devnet". */
export function explorerTxUrl(chain: string, hash: string): string | null {
  const c = chain.toLowerCase();
  const testnet =
    c.includes("sepolia") || c.includes("testnet") || c.includes("devnet");
  if (c.includes("stellar")) {
    return `https://stellar.expert/explorer/${testnet ? "testnet" : "public"}/tx/${hash}`;
  }
  if (c.includes("base")) {
    return `https://${testnet ? "sepolia." : ""}basescan.org/tx/${hash}`;
  }
  if (c.includes("ethereum")) {
    return `https://${testnet ? "sepolia." : ""}etherscan.io/tx/${hash}`;
  }
  if (c.includes("solana")) {
    return `https://solscan.io/tx/${hash}${testnet ? "?cluster=devnet" : ""}`;
  }
  return null;
}
