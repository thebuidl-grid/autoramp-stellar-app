"use client";

import Image from "next/image";
import { ChevronRight } from "lucide-react";

interface CurrencySelectorProps {
  type: "NGN" | "GHS" | "KES" | "CNGN" | "USDC" | "USDT" | "USDCX";
  onClick?: () => void;
  showBaseLogo?: boolean;
  /** Always-visible second line, e.g. the network ("Base"). Replaces the currency name. */
  detail?: string;
}

export function CurrencySelector({ type, onClick, detail }: CurrencySelectorProps) {
  const getLogo = () => {
    switch (type) {
      case "NGN":
        return "/ngn-logo.png";
      case "GHS":
        return "/ghs-flag.svg";
      case "KES":
        return "/kes-flag.svg";
      case "CNGN":
        return "/cngn-logo.png";
      case "USDC":
        return "/usdc-logo.png";
      case "USDT":
        return "/usdt-logo.png";
      case "USDCX":
        return "/usdc-logo.png";
    }
  };

  const getLabel = () => {
    switch (type) {
      case "NGN":
        return "Naira";
      case "GHS":
        return "Cedi";
      case "KES":
        return "Shilling";
      case "CNGN":
        return "CNGN";
      case "USDC":
        return "USDC";
      case "USDT":
        return "USDT";
      case "USDCX":
        return "USDCx · Stacks";
    }
  };

  const isClickable = onClick !== undefined;
  const logo = getLogo();
  const name = getLabel();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      aria-label={isClickable ? `Change currency, now ${type}` : type}
      className={`flex shrink-0 items-center gap-2 rounded-full border border-(--r-line) bg-(--r-raised) py-1.5 pl-1.5 pr-3 transition-colors ${
        isClickable
          ? "cursor-pointer hover:border-(--r-muted)/40"
          : "cursor-default"
      }`}
    >
      <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-(--r-field)">
        {logo ? (
          <Image src={logo} alt="" fill sizes="28px" className="object-contain" />
        ) : (
          <span className="text-[9px] font-bold text-(--r-muted)">{type}</span>
        )}
      </span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-semibold text-(--r-text)">{type}</span>
        {detail ? (
          <span className="block text-[11px] text-(--r-muted)">{detail}</span>
        ) : (
          name !== type && (
            <span className="hidden text-[11px] text-(--r-muted) sm:block">{name}</span>
          )
        )}
      </span>
      {isClickable && <ChevronRight size={14} className="text-(--r-muted)" />}
    </button>
  );
}
