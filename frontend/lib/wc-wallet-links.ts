/** Deep links into WalletConnect-capable wallet apps, from the WalletConnect explorer's listings. */

export interface WcWalletListing {
  id: string;
  name: string;
  /** Logo URL, if the explorer has one. */
  image?: string;
  mobile: { native?: string; universal?: string };
}

/**
 * The registry's link is sometimes already the full WalletConnect endpoint (Lobstr: "https://lobstr.co/uni/wc",
 * Scopuly: "https://app.scopuly.com/wc", Varial: "freighterwallet://wc-redirect"). Adding another "/wc" to those
 * gives a link the wallet rejects, so only add it when the base is just the app's root.
 */
function withUri(base: string, encoded: string): string {
  const [scheme, rest = ""] = base.split("://");
  const path = rest.replace(/\/+$/, "");
  const last = path.split("/").pop() ?? "";
  if (/^wc(-.*)?$/i.test(last)) return `${scheme}://${path}?uri=${encoded}`;
  return `${scheme}://${path ? `${path}/` : ""}wc?uri=${encoded}`;
}

/**
 * Where a wallet app should open to receive a pairing request. The app's own scheme (e.g. "lobstr://wc?uri=…")
 * goes first: Lobstr's universal link ("https://lobstr.co/uni/wc") opens the app on its home screen without a
 * connection request. The universal link is used when the wallet has no native scheme.
 */
export function buildWalletLink(wallet: Pick<WcWalletListing, "mobile">, uri: string): string | null {
  const encoded = encodeURIComponent(uri);
  const native = wallet.mobile.native?.trim();
  if (native) return withUri(native.includes("://") ? native : `${native}://`, encoded);
  const universal = wallet.mobile.universal?.trim();
  if (universal) return withUri(universal, encoded);
  return null;
}

const EXPLORER = "https://explorer-api.walletconnect.com";

/** Look up wallets by explorer id. Failures return an empty list: the QR code and generic link still work. */
export async function fetchWalletListings(projectId: string, ids: string[]): Promise<WcWalletListing[]> {
  try {
    const res = await fetch(`${EXPLORER}/v3/wallets?projectId=${encodeURIComponent(projectId)}&ids=${ids.join(",")}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { listings?: Record<string, any> };
    return Object.values(data.listings ?? {})
      .map((l: any) => ({
        id: String(l.id),
        name: String(l.name ?? ""),
        image: l.image_id
          ? `${EXPLORER}/v3/logo/md/${l.image_id}?projectId=${encodeURIComponent(projectId)}`
          : undefined,
        mobile: { native: l.mobile?.native || undefined, universal: l.mobile?.universal || undefined },
      }))
      .filter((l) => l.name && (l.mobile.native || l.mobile.universal));
  } catch {
    return [];
  }
}
