// Injected into the recorded page (Playwright add_init_script): a minimal EIP-1193 provider
// that forwards every request to the local demo wallet server.
(() => {
  const listeners = {};
  let chainHex = "0x14a34"; // Base Sepolia
  const emit = (ev, ...a) => (listeners[ev] || []).forEach((f) => { try { f(...a); } catch (_) {} });
  const rpc = async (method, params) => {
    const r = await fetch("http://127.0.0.1:8787", { method: "POST", body: JSON.stringify({ method, params }) });
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
    return j.result;
  };
  // Behave like a locked MetaMask: no accounts until the app calls eth_requestAccounts,
  // so the recording shows the real Connect click instead of a silent auto-connect.
  const KEY = "demo_wallet_authorized";
  const isAuthorized = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch (_) { return false; } };
  const authorize = () => { try { sessionStorage.setItem(KEY, "1"); } catch (_) {} };
  const provider = {
    isDemoWallet: true,
    isMetaMask: false,
    request: async ({ method, params }) => {
      if (method === "eth_accounts" && !isAuthorized()) return [];
      if (method === "eth_requestAccounts" || method === "wallet_requestPermissions") authorize();
      const res = await rpc(method, params || []);
      if (method === "wallet_switchEthereumChain") { chainHex = params[0].chainId; emit("chainChanged", chainHex); }
      if (method === "eth_chainId") chainHex = res;
      return res;
    },
    on: (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); return provider; },
    removeListener: (ev, f) => { listeners[ev] = (listeners[ev] || []).filter((x) => x !== f); return provider; },
    enable: () => rpc("eth_requestAccounts", []),
  };
  // Emulates the Rabet Stellar wallet (the app's Stellar wallet kit enables a Rabet module):
  // window.rabet.connect() -> { publicKey }, window.rabet.sign(xdr, network) -> { xdr }.
  const PASSPHRASE = { mainnet: "Public Global Stellar Network ; September 2015", testnet: "Test SDF Network ; September 2015" };
  Object.defineProperty(window, "rabet", {
    value: {
      connect: async () => rpc("stellar_connect", []),
      sign: async (xdr, network) => ({ xdr: await rpc("stellar_sign", [xdr, PASSPHRASE[network] || PASSPHRASE.testnet]) }),
    },
    writable: false, configurable: true,
  });
  Object.defineProperty(window, "ethereum", { value: provider, writable: false, configurable: true });
})();
