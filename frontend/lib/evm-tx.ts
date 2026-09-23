/**
 * Minimal EVM helpers for the bridge UI — no viem/ethers dependency on the
 * frontend (that's backend-only, see EvmRelayerService). Just enough to:
 * read the connected wallet's chain/address via the injected provider, and
 * submit unsigned calldata the backend built (approve/depositForBurnWithHook)
 * for the wallet to sign.
 */

// EVM chain ids for the two EVM chains currently in the registry — mirrors
// backend/src/modules/bridge/providers/evm-relayer.service.ts's viem chain
// mapping, toggled by the same NEXT_PUBLIC_STELLAR_NETWORK flag
// lib/stellar-wallet-config.ts already uses (one switch for "testnet or
// mainnet" across every chain, matching the backend's STELLAR_NETWORK
// pattern). Extend both maps (and CHAIN_ADD_PARAMS below) alongside a new
// Chain registry row.
const IS_MAINNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet";

export const CHAIN_ID_TO_NAME: Record<number, string> = IS_MAINNET
  ? { 8453: "base", 1: "ethereum", 42161: "arbitrum", 10: "optimism", 137: "polygon", 43114: "avalanche" }
  : {
      84532: "base", // Base Sepolia
      11155111: "ethereum", // Ethereum Sepolia
      421614: "arbitrum", // Arbitrum Sepolia
      11155420: "optimism", // OP Sepolia
      80002: "polygon", // Polygon Amoy
      43113: "avalanche", // Avalanche Fuji
    };

export const CHAIN_NAME_TO_HEX_ID: Record<string, string> = IS_MAINNET
  ? { base: "0x2105", ethereum: "0x1", arbitrum: "0xa4b1", optimism: "0xa", polygon: "0x89", avalanche: "0xa86a" } // 8453, 1, 42161, 10, 137, 43114
  : {
      base: "0x14a34", // 84532
      ethereum: "0xaa36a7", // 11155111
      arbitrum: "0x66eee", // 421614
      optimism: "0xaa37dc", // 11155420
      polygon: "0x13882", // 80002
      avalanche: "0xa869", // 43113
    };

type ChainAddParams = { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };

/** wallet_addEthereumChain params — only needed the first time a wallet hasn't seen this chain before. */
const CHAIN_ADD_PARAMS: Record<string, ChainAddParams> = IS_MAINNET
  ? {
      base: {
        chainId: "0x2105",
        chainName: "Base",
        rpcUrls: ["https://mainnet.base.org"],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://basescan.org"],
      },
      ethereum: {
        chainId: "0x1",
        chainName: "Ethereum Mainnet",
        rpcUrls: ["https://ethereum-rpc.publicnode.com"],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://etherscan.io"],
      },
      arbitrum: {
        chainId: "0xa4b1",
        chainName: "Arbitrum One",
        rpcUrls: ["https://arb1.arbitrum.io/rpc"],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://arbiscan.io"],
      },
      optimism: {
        chainId: "0xa",
        chainName: "OP Mainnet",
        rpcUrls: ["https://mainnet.optimism.io"],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://optimistic.etherscan.io"],
      },
      polygon: {
        chainId: "0x89",
        chainName: "Polygon",
        rpcUrls: ["https://polygon-rpc.com"],
        nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
        blockExplorerUrls: ["https://polygonscan.com"],
      },
      avalanche: {
        chainId: "0xa86a",
        chainName: "Avalanche C-Chain",
        rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
        nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
        blockExplorerUrls: ["https://snowtrace.io"],
      },
    }
  : {
      base: {
        chainId: "0x14a34",
        chainName: "Base Sepolia",
        rpcUrls: ["https://sepolia.base.org"],
        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://sepolia.basescan.org"],
      },
      ethereum: {
        chainId: "0xaa36a7",
        chainName: "Sepolia",
        rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://sepolia.etherscan.io"],
      },
      arbitrum: {
        chainId: "0x66eee",
        chainName: "Arbitrum Sepolia",
        rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://sepolia.arbiscan.io"],
      },
      optimism: {
        chainId: "0xaa37dc",
        chainName: "OP Sepolia",
        rpcUrls: ["https://sepolia.optimism.io"],
        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["https://sepolia-optimism.etherscan.io"],
      },
      polygon: {
        chainId: "0x13882",
        chainName: "Polygon Amoy",
        rpcUrls: ["https://rpc-amoy.polygon.technology"],
        nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
        blockExplorerUrls: ["https://amoy.polygonscan.com"],
      },
      avalanche: {
        chainId: "0xa869",
        chainName: "Avalanche Fuji",
        rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
        nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
        blockExplorerUrls: ["https://testnet.snowtrace.io"],
      },
    };

export function getInjectedProvider(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).ethereum ?? null;
}

export async function requestEvmAccount(): Promise<{ address: string; chainId: number }> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error("No EVM wallet found — install MetaMask or another injected wallet");
  }
  const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
  const chainIdHex: string = await provider.request({ method: "eth_chainId" });
  return { address: accounts[0], chainId: parseInt(chainIdHex, 16) };
}

/**
 * Prompts the wallet to switch to the given chain (by our registry name,
 * e.g. "base"/"ethereum") — this is what makes "pick a chain" in the UI
 * actually pick that chain, instead of just accepting whatever network the
 * wallet happened to already be on. Falls back to wallet_addEthereumChain
 * if the wallet has never seen this chain before (error code 4902).
 */
export async function switchToChain(chainName: string): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No EVM wallet found");
  const hexId = CHAIN_NAME_TO_HEX_ID[chainName];
  if (!hexId) throw new Error(`Unsupported EVM chain "${chainName}"`);

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err: any) {
    if (err?.code === 4902) {
      const addParams = CHAIN_ADD_PARAMS[chainName];
      if (!addParams) throw err;
      await provider.request({ method: "wallet_addEthereumChain", params: [addParams] });
    } else {
      throw err;
    }
  }
}

/** Submits unsigned calldata (built server-side by EvmRelayerService) via the connected wallet. */
export async function sendRawTransaction(params: {
  from: string;
  to: string;
  data: string;
  value?: string; // hex, e.g. "0x0" — defaults to "0x0" if omitted
}): Promise<string> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No EVM wallet found");

  return provider.request({
    method: "eth_sendTransaction",
    params: [{ from: params.from, to: params.to, data: params.data, value: params.value ?? "0x0" }],
  });
}

/**
 * Polls until a submitted transaction is mined. Needed between the approve
 * and burn legs of a CCTP deposit — the wallet returns the approve tx hash
 * before it's confirmed, and submitting the burn immediately risks it
 * reverting on a stale allowance.
 */
export async function waitForReceipt(txHash: string, intervalMs = 1500, timeoutMs = 120_000): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No EVM wallet found");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
    if (receipt) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for transaction ${txHash} to be mined`);
}
