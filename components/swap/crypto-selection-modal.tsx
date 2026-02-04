"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CryptoSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCrypto: "CNGN" | "USDC" | "USDT";
  onSelect: (crypto: "CNGN" | "USDC" | "USDT") => void;
  showComingSoon?: boolean;
}

export function CryptoSelectionModal({
  open,
  onOpenChange,
  selectedCrypto,
  onSelect,
  showComingSoon = false,
}: CryptoSelectionModalProps) {
  const cryptoOptions = [
    {
      id: "CNGN" as const,
      logo: "/cngn-logo.png",
      alt: "CNGN",
      showSubtitle: true,
      comingSoon: false,
    },
    {
      id: "USDC" as const,
      logo: "/usdc-logo.png",
      alt: "USDC",
      showSubtitle: true,
      comingSoon: showComingSoon,
    },
    {
      id: "USDT" as const,
      logo: "/usdt-logo.png",
      alt: "USDT",
      showSubtitle: true,
      comingSoon: showComingSoon,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/30 backdrop-blur-xl rounded-xl border-white/10 text-white w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Select Crypto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-4">
          {cryptoOptions.map((crypto) => (
            <button
              key={crypto.id}
              type="button"
              onClick={() => {
                if (!crypto.comingSoon) {
                  onSelect(crypto.id);
                }
              }}
              disabled={crypto.comingSoon}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-white/10 relative disabled:opacity-60 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                <Image
                  src={crypto.logo}
                  alt={crypto.alt}
                  width={48}
                  height={48}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 text-left">
                {crypto.showSubtitle && (
                  <div className="text-sm text-white/50">{crypto.id}</div>
                )}
                <div className="text-lg font-medium text-white">
                  {crypto.id}
                </div>
                {crypto.comingSoon && (
                  <div className="text-xs text-white/50 mt-1">Coming soon</div>
                )}
              </div>
              {selectedCrypto === crypto.id && !crypto.comingSoon && (
                <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-black"></div>
                </div>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
