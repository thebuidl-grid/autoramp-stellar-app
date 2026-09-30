"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Known logos — anything not listed (e.g. a newly seeded corridor's
// stablecoin) falls back to a text badge, so the modal never needs a new
// asset before a corridor can be selected.
const KNOWN_LOGOS: Record<string, string> = {
  CNGN: "/cngn-logo.png",
  USDC: "/usdc-logo.png",
};

export interface CryptoOption {
  code: string;
  // Display name shown instead of the raw code, e.g. "USDC (Bridge)" for
  // BRIDGE_USDC — keeps the code itself unambiguous for API calls while the
  // UI stays readable.
  label?: string;
  comingSoon?: boolean;
}

interface CryptoSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCrypto: string;
  onSelect: (crypto: string) => void;
  // Defaults to the legacy CNGN/USDC pair for callers that haven't been
  // wired to the corridor registry yet.
  options?: CryptoOption[];
  // Reused as a plain fiat-currency picker (Buy's "You'll send" side) —
  // override the dialog title for that case instead of forking the
  // component for what's otherwise the exact same list-picker UI.
  title?: string;
}

const DEFAULT_OPTIONS: CryptoOption[] = [{ code: "CNGN" }, { code: "USDC" }];

export function CryptoSelectionModal({
  open,
  onOpenChange,
  selectedCrypto,
  onSelect,
  options = DEFAULT_OPTIONS,
  title = "Select Crypto",
}: CryptoSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/30 backdrop-blur-xl rounded-xl border-white/10 text-white w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-4">
          {options.map((crypto) => {
            const code = crypto.code.toUpperCase();
            const logo = KNOWN_LOGOS[code];
            const displayName = crypto.label || code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  if (!crypto.comingSoon) {
                    onSelect(code);
                  }
                }}
                disabled={crypto.comingSoon}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-white/10 relative disabled:opacity-60 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                  {logo ? (
                    <img
                      src={logo}
                      alt={code}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-white/70">
                      {code.slice(0, 4)}
                    </span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm text-white/50">{code}</div>
                  <div className="text-lg font-medium text-white">{displayName}</div>
                  {crypto.comingSoon && (
                    <div className="text-xs text-white/50 mt-1">Coming soon</div>
                  )}
                </div>
                {selectedCrypto === code && !crypto.comingSoon && (
                  <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-black"></div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
