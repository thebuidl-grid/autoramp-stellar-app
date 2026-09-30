"use client";

import Image from "next/image";
import { ChevronRight } from "lucide-react";

interface CurrencySelectorProps {
  type: "NGN" | "CNGN" | "USDC" | "USDT";
  onClick?: () => void;
  showBaseLogo?: boolean;
}

export function CurrencySelector({ type, onClick }: CurrencySelectorProps) {
  const getLogo = () => {
    switch (type) {
      case "NGN":
        return "/ngn-logo.png";
      case "CNGN":
        return "/cngn-logo.png";
      case "USDC":
        return "/usdc-logo.png";
      case "USDT":
        return "/usdt-logo.png";
    }
  };

  const getLabel = () => {
    switch (type) {
      case "NGN":
        return "Naira";
      case "CNGN":
        return "CNGN";
      case "USDC":
        return "USDC";
      case "USDT":
        return "USDT";
    }
  };

  const isClickable = onClick !== undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`flex items-center gap-3 px-3 py-1.5 md:px-4 md:py-2.5 rounded-xl border border-white/10 bg-white/5 transition-colors ${
        isClickable ? "hover:bg-white/10 cursor-pointer" : "cursor-default"
      }`}
    >
      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden relative">
        <Image
          src={getLogo()}
          alt={type}
          fill
          className="object-contain"
        />
      </div>
      <div className="text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/50">{getLabel()}</span>
        </div>
        <div className="text-sm font-medium text-white">{type}</div>
      </div>
      {isClickable && <ChevronRight size={16} className="text-white/40" />}
    </button>
  );
}
