"use client";

import { AmountInput } from "./amount-input";
import { ChainSelector } from "./chain-selector";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface BridgeSectionProps {
  label: string;
  amount: string;
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  chain: string;
  onChainClick?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  userBalance?: string;
  onPercentageClick?: (value: string) => void;
  direction: "from" | "to";
}

export function BridgeSection({
  label,
  amount,
  onAmountChange,
  chain,
  onChainClick,
  disabled = false,
  isLoading = false,
  userBalance,
  onPercentageClick,
  direction,
}: BridgeSectionProps) {
  const handlePercent = (percent: number) => {
    if (userBalance === undefined || !onPercentageClick) return;

    const value = parseFloat(userBalance) * percent;
    const formatted = parseFloat(value.toFixed(6)).toString();

    onPercentageClick(formatted);
  };

  return (
    <div className="space-y-3 bg-black/50 rounded-xl border border-white/10 shadow-2xl p-4 lg:p-6">
      <div className="flex justify-between items-center">
        <label className="text-xs text-white/50">{label}</label>

        {userBalance !== undefined && onPercentageClick && !disabled && direction === "from" && (
          <div className="flex gap-2">
            {[0.25, 0.5, 1].map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => handlePercent(percent)}
                className={cn(
                  "text-[10px] font-medium px-2 py-1 rounded-md transition-colors",
                  "bg-white/5 hover:bg-white/10 text-white/70 hover:text-white",
                )}
              >
                {percent === 1 ? "100%" : `${percent * 100}%`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch justify-between gap-4">
          <div className="flex-1 flex items-center justify-between h-[64px] px-4 bg-white/5 rounded-xl border border-white/10 group transition-all focus-within:border-secondary/50 hover:bg-white/10">
            <div className="flex-1">
              {direction === "from" ? (
                <AmountInput
                  value={amount}
                  onChange={onAmountChange}
                  disabled={disabled}
                  isLoading={isLoading}
                />
              ) : (
                <div className="text-2xl md:text-4xl font-light text-white/50 truncate">
                  {amount || "0.00"}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
              <div className="w-5 h-5 relative">
                <Image 
                  src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040" 
                  alt="USDC" 
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-[10px] font-bold text-blue-400 tracking-wider">USDC</span>
            </div>
          </div>

          <div className="md:w-auto shrink-0">
            <ChainSelector 
              chain={chain} 
              onClick={onChainClick} 
              label={direction === "from" ? "From Network" : "To Network"} 
            />
          </div>
        </div>
        
        {userBalance !== undefined && direction === "from" && (
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-white/30 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse" />
            Balance:{" "}
            <span className="text-white/60">
              {parseFloat(userBalance).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}
            </span>
            <span className="text-white/30 tracking-widest ml-1">USDC</span>
          </div>
        )}
      </div>
    </div>
  );
}
