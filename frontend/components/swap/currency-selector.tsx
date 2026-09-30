"use client";

import { ChevronRight } from "lucide-react";

interface CurrencySelectorProps {
  type: string;
  onClick?: () => void;
  showBaseLogo?: boolean;
}

// Known logo/label overrides — anything not listed here (e.g. a newly
// seeded corridor's stablecoin or fiat code) falls back to a generic
// badge showing the code itself, so the UI never needs a new asset
// before a corridor can be selected.
const KNOWN: Record<string, { logo: string; label: string }> = {
  NGN: { logo: "/ngn-logo.png", label: "Naira" },
  CNGN: { logo: "/cngn-logo.png", label: "CNGN" },
  USDC: { logo: "/usdc-logo.png", label: "USDC" },
};

export function CurrencySelector({ type, onClick }: CurrencySelectorProps) {
  const known = KNOWN[type.toUpperCase()];
  const logo = known?.logo;
  const label = known?.label ?? type.toUpperCase();

  const isClickable = onClick !== undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`flex items-center gap-3 px-3 py-1.5 md:px-4 md:py-2.5 rounded-xl border border-white/10 bg-white/5 transition-colors ${isClickable
          ? "hover:bg-white/10 cursor-pointer"
          : "cursor-default"
        }`}
    >
      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
        {logo ? (
          <img
            src={logo}
            alt={type}
            className="w-6 h-6 md:w-8 md:h-8 object-contain"
          />
        ) : (
          <span className="text-[9px] font-semibold text-white/70">
            {type.toUpperCase().slice(0, 4)}
          </span>
        )}
      </div>
      <div className="text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/50">{label}</span>
        </div>
        <div className="text-sm font-medium text-white">{type.toUpperCase()}</div>
      </div>
      {isClickable && <ChevronRight size={16} className="text-white/40" />}
    </button>
  );
}
