// Local "browser wallet" for demo recordings: a JSON-RPC server that signs with a throwaway testnet key.
// The recorded page gets a window.ethereum (scripts/demo-wallet-provider.js) that forwards here, so the
// app's real wagmi/RainbowKit connect + approve + burn flow runs with real signatures and real txs.
//   DEMO_WALLET_FILE=/path/wallet.json node scripts/demo-wallet-server.mjs      (listens on 127.0.0.1:8787)
import fs from "node:fs";
import http from "node:http";
import { createPublicClient, createWalletClient, http as vhttp, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia } from "viem/chains";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

const wallet = JSON.parse(fs.readFileSync(process.env.DEMO_WALLET_FILE, "utf8"));
const account = privateKeyToAccount(wallet.evm.privateKey);
const CHAINS = {
  11155111: { chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  84532: { chain: baseSepolia, rpc: "https://sepolia.base.org" },
};
const stellarKp = Keypair.fromSecret(wallet.stellar.secret);
let chainId = 84532; // Base Sepolia (the demo source chain)
const clientFor = (id) => {
  const c = CHAINS[id];
  return {
    pub: createPublicClient({ chain: c.chain, transport: vhttp(c.rpc) }),
    wal: createWalletClient({ account, chain: c.chain, transport: vhttp(c.rpc) }),
    rpc: c.rpc,
  };
};

async function handle({ method, params = [] }) {
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts": return [account.address];
    case "eth_chainId": return toHex(chainId);
    case "net_version": return String(chainId);
    case "wallet_switchEthereumChain": {
      const id = parseInt(params[0].chainId, 16);
      if (!CHAINS[id]) { const e = new Error("Unrecognized chain"); e.code = 4902; throw e; }
      chainId = id; return null;
    }
    // --- Stellar (emulates Rabet's window.rabet: connect + sign) ---
    case "stellar_connect": return { publicKey: stellarKp.publicKey() };
    case "stellar_sign": {
      const tx = TransactionBuilder.fromXDR(params[0], params[1]);
      tx.sign(stellarKp);
      return tx.toXDR();
    }
    case "wallet_requestPermissions": return [{ parentCapability: "eth_accounts" }];
    case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
    case "eth_sendTransaction": {
      const t = params[0];
      const { wal } = clientFor(chainId);
      return wal.sendTransaction({
        to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined,
        gas: t.gas ? BigInt(t.gas) : undefined,
      });
    }
    case "personal_sign": return account.signMessage({ message: { raw: params[0] } });
    case "eth_signTypedData_v4": return account.signTypedData(JSON.parse(params[1]));
    default: {
      const r = await fetch(clientFor(chainId).rpc, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
      return j.result;
    }
  }
}

http.createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", async () => {
    try {
      const result = await handle(JSON.parse(body));
      console.log(new Date().toISOString().slice(11, 19), JSON.parse(body).method);
      res.writeHead(200, { ...cors, "content-type": "application/json" }); res.end(JSON.stringify({ result }));
    } catch (e) {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: e.code ?? -32000, message: e.shortMessage || e.message } }));
    }
  });
}).listen(8787, "127.0.0.1", () => console.log("demo wallet", account.address, "/", stellarKp.publicKey(), "on :8787"));
