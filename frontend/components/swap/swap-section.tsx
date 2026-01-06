"use client";

import { AmountInput } from "./amount-input";
import { CurrencySelector } from "./currency-selector";

interface SwapSectionProps {
  label: string;
  amount: string;
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  currencyType: "NGN" | "CNGN" | "USDC";
  onCurrencyClick?: () => void;
  showBaseLogo?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
}

export function SwapSection({
  label,
  amount,
  onAmountChange,
  currencyType,
  onCurrencyClick,
  disabled = false,
  isLoading = false,
}: SwapSectionProps) {

  return (
    <div className="space-y-3 bg-black/50 rounded-xl border border-white/10 shadow-2xl p-4 lg:p-6">
      <label className="text-xs text-white/50">{label}</label>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <AmountInput
            value={amount}
            onChange={onAmountChange}
            disabled={disabled}
            isLoading={isLoading}
          />
          <CurrencySelector
            type={currencyType}
            onClick={onCurrencyClick}
          />
        </div>
      </div>
    </div>
  );
}

