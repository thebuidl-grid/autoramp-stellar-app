"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { getChainMetadata } from "@/lib/constants/networks";

interface ChainSelectorProps {
  chain: string;
  onClick?: () => void;
  label: string;
}

export function ChainSelector({ chain, onClick, label }: ChainSelectorProps) {
  const metadata = getChainMetadata(chain);
  const logo = metadata?.logo;

  const isClickable = onClick !== undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`flex items-center gap-3 px-4 h-[64px] rounded-xl border border-white/10 bg-white/5 transition-all w-full shrink-0 group ${
        isClickable ? "hover:bg-white/10 hover:border-white/20 cursor-pointer active:scale-[0.98]" : "cursor-default"
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center overflow-hidden p-1.5 border border-white/10 relative">
        {logo ? (
          <Image
            src={logo}
            alt={chain}
            fill
            className="object-contain p-2"
          />
        ) : (
          <div className="text-[10px] font-bold text-white/40 uppercase bg-gradient-to-br from-white/10 to-white/5 w-full h-full flex items-center justify-center">
            {chain.substring(0, 2)}
          </div>
        )}
      </div>
      <div className="text-left flex-1 min-w-[80px]">
        <div className="flex items-center gap-1.5 leading-none mb-1">
          <span className="text-[10px] uppercase tracking-wider text-white/30 font-bold">{label}</span>
        </div>
        <div className="text-sm font-semibold text-white truncate">{chain}</div>
      </div>
      {isClickable && <ChevronRight size={14} className="text-white/20 group-hover:text-white/40 transition-colors" />}
    </button>
  );
}
