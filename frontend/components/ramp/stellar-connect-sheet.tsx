"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { RampSheet } from "@/components/ramp/ramp-sheet";
import { CopyButton } from "@/components/ramp/processing";

/**
 * Connect a Stellar wallet over WalletConnect, in our own panel: a QR code to scan, plus "open in app" links for
 * the featured wallets. Shown while a connection is waiting for the wallet to approve.
 */
export function StellarConnectSheet({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) {
      setSvg(null);
      return;
    }
    let live = true;
    QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#06100e", light: "#ffffff" } })
      .then((out) => live && setSvg(out))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [uri]);

  return (
    <RampSheet open={!!uri} onOpenChange={(open) => !open && onClose()} title="Connect Stellar wallet">
      <div className="space-y-6">
        <section className="space-y-3 text-center" aria-label="Scan to connect">
          <div className="mx-auto flex aspect-square w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-2xl bg-white p-3">
            {svg ? (
              <div
                role="img"
                aria-label="WalletConnect QR code"
                className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                // The SVG comes from the qrcode library for our own pairing link, not from user input.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-(--r-muted)" aria-label="Preparing QR code" />
            )}
          </div>
          <p className="text-sm text-(--r-muted)">Scan with a WalletConnect wallet such as Lobstr or Varial.</p>
          <p className="flex items-center justify-center gap-2 text-xs text-(--r-muted)">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--r-signal)" />
            Waiting for your wallet to approve
          </p>
        </section>

        {uri && (
          <section className="space-y-2" aria-label="On this phone">
            <h3 className="ramp-label">On this phone</h3>
            {/* The plain WalletConnect link: the phone offers the wallet apps that can handle it (Lobstr, Varial, ...).
                Per-wallet deep links from the registry did not open a connection request, this one does. */}
            <a href={uri} className="ramp-cta flex items-center justify-center">
              Open wallet app
            </a>
            <div className="flex items-center justify-between rounded-xl border border-(--r-line) bg-(--r-field) px-3 py-2">
              <span className="text-sm text-(--r-muted)">Copy connection link</span>
              <CopyButton value={uri} label="Copy connection link" toastText="Link copied" />
            </div>
          </section>
        )}
      </div>
    </RampSheet>
  );
}
