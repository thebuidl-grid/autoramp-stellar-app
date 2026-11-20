/**
 * Stellar over WalletConnect (Reown). The only way a Stellar wallet connects: the user scans a QR code or opens their
 * wallet app, then the wallet approves every signature. No browser-extension wallets.
 *
 * This module has no UI and does not use AppKit's modal (AppKit allows one modal per page and has no Stellar
 * adapter); it hands the connection link to our own panel through `onUri`.
 *
 * Everything here is lazy-loaded so the heavy WalletConnect bundle is only fetched when a Stellar wallet is used.
 */
import { IS_TESTNET } from "@/lib/constants/networks";
import { WALLETCONNECT_PROJECT_ID } from "@/lib/constants/walletconnect";
import { pickStellarSession, type StellarWcChain, type WcSessionLike } from "@/lib/stellar-wc-restore";

export const STELLAR_WC_CHAIN: StellarWcChain = IS_TESTNET ? "stellar:testnet" : "stellar:pubnet";

export const WC_STELLAR_METHODS = {
  SIGN: "stellar_signXDR",
  SIGN_AND_SUBMIT: "stellar_signAndSubmitXDR",
  SIGN_AUTH_ENTRY: "stellar_signAuthEntry",
  SIGN_MESSAGE: "stellar_signMessage",
} as const;

/** Wallets promoted in the connect panel (Varial, Lobstr, Scopuly), by WalletConnect explorer id. */
export const FEATURED_STELLAR_WALLET_IDS = [
  "997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380",
  "76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b",
  "9c78aee7d8a771255942334d06d2cbab89e2178ee49fee4ea3b6c78032fcac76",
];

export function walletConnectProjectId(): string | undefined {
  return WALLETCONNECT_PROJECT_ID || undefined;
}

/** The request the wallet receives to sign a transaction. Pure, so it can be tested. */
export function buildSignRequest(topic: string, xdr: string, chain: StellarWcChain = STELLAR_WC_CHAIN) {
  return {
    topic,
    chainId: chain,
    request: { method: WC_STELLAR_METHODS.SIGN, params: { xdr } },
  };
}

/** Accounts in a session look like "stellar:pubnet:G...". */
export function addressesFromSession(session: WcSessionLike): string[] {
  return (session.namespaces?.stellar?.accounts ?? [])
    .map((a) => String(a).split(":")[2])
    .filter((a): a is string => !!a);
}

type SignClientLike = {
  connect: (p: unknown) => Promise<{ uri?: string; approval: () => Promise<WcSessionLike> }>;
  request: <T>(p: ReturnType<typeof buildSignRequest>) => Promise<T>;
  disconnect: (p: { topic: string; reason: { code: number; message: string } }) => Promise<void>;
  on: (event: string, cb: (ev: { topic: string }) => void) => void;
  session: { getAll: () => WcSessionLike[] };
};
let wcPromise: Promise<{ client: SignClientLike }> | null = null;
const deleteListeners = new Set<(topic: string) => void>();

/** Called when the wallet ends a session from its own side. */
export function onSessionDeleted(cb: (topic: string) => void): () => void {
  deleteListeners.add(cb);
  return () => deleteListeners.delete(cb);
}

async function getWc() {
  if (!wcPromise) {
    wcPromise = (async () => {
      const projectId = walletConnectProjectId();
      if (!projectId) {
        throw new Error("WalletConnect isn't configured (no project id).");
      }
      const { default: SignClient } = await import("@walletconnect/sign-client");
      const origin = window.location.origin;
      const client = (await SignClient.init({
        projectId,
        metadata: {
          name: "AutoRamp",
          description: "AutoRamp",
          url: origin,
          icons: [`${origin}/favicon.ico`],
          // Lets the wallet app return to this browser tab after approving.
          redirect: { universal: origin },
        } as never,
      })) as unknown as SignClientLike;
      client.on("session_delete", (ev) => deleteListeners.forEach((cb) => cb(ev.topic)));
      return { client };
    })().catch((e) => {
      wcPromise = null; // let the next attempt retry
      throw e;
    });
  }
  return wcPromise;
}

/** Latest approved Stellar session for the app's network, if any (WalletConnect persists them across reloads). */
export async function findStellarSession(): Promise<{ address: string; topic: string } | null> {
  if (!walletConnectProjectId()) return null;
  const { client } = await getWc();
  return pickStellarSession(client.session.getAll(), STELLAR_WC_CHAIN, Math.floor(Date.now() / 1000));
}

/**
 * Start a WalletConnect pairing and wait for the wallet to approve. `onUri` receives the pairing link as soon as it
 * exists (show it as a QR code and as "open in wallet app" links). Abort the signal to stop waiting.
 */
export async function connectWalletConnect(opts: {
  onUri: (uri: string) => void;
  signal?: AbortSignal;
}): Promise<{ address: string; topic: string }> {
  const { client } = await getWc();
  const chain = STELLAR_WC_CHAIN;
  const { uri, approval } = await client.connect({
    requiredNamespaces: { stellar: { methods: [WC_STELLAR_METHODS.SIGN], chains: [chain], events: [] } },
    optionalNamespaces: {
      stellar: {
        methods: [WC_STELLAR_METHODS.SIGN_AND_SUBMIT, WC_STELLAR_METHODS.SIGN_AUTH_ENTRY, WC_STELLAR_METHODS.SIGN_MESSAGE],
        chains: [chain],
        events: [],
      },
    },
  });
  if (uri) opts.onUri(uri);

  const cancelled = new Promise<never>((_, reject) => {
    const abort = () => reject(new Error("The connection window was closed."));
    if (opts.signal?.aborted) abort();
    else opts.signal?.addEventListener("abort", abort, { once: true });
  });
  const session = await Promise.race([approval(), cancelled]);
  const picked = pickStellarSession([session], chain, Math.floor(Date.now() / 1000));
  if (!picked) throw new Error("The wallet didn't share a Stellar account for this network.");
  return picked;
}

/** Ask the connected wallet to sign a transaction XDR. The user approves in their wallet app. */
export async function signWithWalletConnect(address: string, xdr: string): Promise<string> {
  const { client } = await getWc();
  const session = client.session
    .getAll()
    .find((s) => addressesFromSession(s).includes(address) && (s.namespaces?.stellar?.accounts ?? []).some((a) => a.startsWith(STELLAR_WC_CHAIN)));
  if (!session) throw new Error("Your wallet connection has expired. Connect your Stellar wallet again.");
  const result = await client.request<{ signedXDR?: string; signedTxXdr?: string }>(buildSignRequest(session.topic, xdr));
  const signed = result?.signedXDR ?? result?.signedTxXdr;
  if (!signed) throw new Error("The wallet didn't return a signed transaction.");
  return signed;
}

export async function disconnectWalletConnect(topic?: string): Promise<void> {
  if (!walletConnectProjectId()) return;
  try {
    const { client } = await getWc();
    const topics = topic ? [topic] : client.session.getAll().map((s) => s.topic);
    await Promise.all(
      topics.map((t) => client.disconnect({ topic: t, reason: { code: 6000, message: "User disconnected" } }).catch(() => {})),
    );
  } catch {
    // best effort
  }
}
