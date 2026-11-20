"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { getChainMetadata } from "@/lib/constants/networks";

interface ChainSelectorProps {
  chain: string;
  onClick?: () => void;
  /** Accessible context, e.g. "From network". */
  label: string;
}

/** A network row inside a bridge field: logo, name, chevron. */
export function ChainSelector({ chain, onClick, label }: ChainSelectorProps) {
  const metadata = getChainMetadata(chain);
  const logo = metadata?.logo;
  const displayName = metadata?.name || chain;
  const isClickable = onClick !== undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      aria-label={isClickable ? `${label}: ${displayName}. Change` : `${label}: ${displayName}`}
      className={`flex h-12 w-full items-center gap-3 rounded-xl border border-(--r-line) bg-(--r-raised) px-3 text-left transition-colors ${
        isClickable ? "cursor-pointer hover:border-(--r-muted)/40" : "cursor-default"
      }`}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--r-field)">
        {logo ? (
          <Image src={logo} alt="" fill sizes="28px" className="object-contain p-1" />
        ) : (
          <span className="text-[10px] font-bold text-(--r-muted)">
            {displayName.substring(0, 2)}
          </span>
        )}
      </span>
      <span className="flex-1 truncate text-sm font-semibold text-(--r-text)">
        {displayName}
      </span>
      {isClickable && <ChevronRight size={14} className="text-(--r-muted)" />}
    </button>
  );
}
