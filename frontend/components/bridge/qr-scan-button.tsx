"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";

interface QrScanButtonProps {
  onScan: (value: string) => void;
}

/**
 * Scans a QR code via the browser-native BarcodeDetector API — no extra
 * dependency for camera decoding. Chrome/Edge support it today; Safari/
 * Firefox don't, so the button simply doesn't render there and the
 * always-present manual paste field stays the primary entry method.
 */
export function QrScanButton({ onScan }: QrScanButtonProps) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    let cancelled = false;
    let raf: number;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // @ts-expect-error — BarcodeDetector isn't in TS's DOM lib yet
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              onScan(barcodes[0].rawValue);
              setOpen(false);
              return;
            }
          } catch {
            // transient decode failures are normal mid-scan — keep looping
          }
          raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Camera access denied");
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open, onScan]);

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        aria-label="Scan QR code"
      >
        <ScanLine size={18} className="text-white/70" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-black/90 backdrop-blur-xl rounded-xl border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Scan address QR code</DialogTitle>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-red-400 py-4">{error}</p>
          ) : (
            <video ref={videoRef} className="w-full rounded-lg" muted playsInline />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
