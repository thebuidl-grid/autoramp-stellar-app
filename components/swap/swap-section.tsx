"use client";

import { AmountInput } from "./amount-input";
import { CurrencySelector } from "./currency-selector";
import { cn } from "@/lib/utils"; // Assuming you have a cn utility, otherwise use standard string

interface SwapSectionProps {
  label: string;
  amount: string;
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  currencyType: "NGN" | "CNGN" | "USDC" | "USDT";
  onCurrencyClick?: () => void;
  showBaseLogo?: boolean;
  disabled?: boolean;
  isLoading?: boolean;

  // New Props
  userBalance?: number;
  onPercentageClick?: (value: string) => void;
}

export function SwapSection({
  label,
  amount,
  onAmountChange,
  currencyType,
  onCurrencyClick,
  disabled = false,
  isLoading = false,
  userBalance,
  onPercentageClick,
}: SwapSectionProps) {
  const handlePercent = (percent: number) => {
    if (userBalance === undefined || !onPercentageClick) return;

    // Calculate percentage
    const value = userBalance * percent;

    // logic to handle decimals or "floor" slightly to avoid "insufficient funds" due to gas
    // For simplicity, we keep up to 6 decimal places (standard for USDC/CNGN)
    // and remove trailing zeros/dots.
    const formatted = parseFloat(value.toFixed(6)).toString();

    onPercentageClick(formatted);
  };

  return (
    <div className="space-y-3 bg-black/50 rounded-xl border border-white/10 shadow-2xl p-4 lg:p-6">
      <div className="flex justify-between items-center">
        <label className="text-xs text-white/50">{label}</label>

        {/* Only show buttons if we have a balance and a handler */}
        {userBalance !== undefined && onPercentageClick && !disabled && (
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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <AmountInput
            value={amount}
            onChange={onAmountChange}
            disabled={disabled}
            isLoading={isLoading}
          />
          <CurrencySelector type={currencyType} onClick={onCurrencyClick} />
        </div>
        {/* Optional: Show balance text below input for reference */}
        {userBalance !== undefined && (
          <div className="text-right text-[10px] text-white/30">
            Balance:{" "}
            {userBalance.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </div>
        )}
      </div>
    </div>
  );
}
