"use client";

import { AmountInput } from "./amount-input";
import { CurrencySelector } from "./currency-selector";

interface SwapSectionProps {
  label: string;
  amount: string;
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  currencyType: "NGN" | "GHS" | "KES" | "CNGN" | "USDC" | "USDT" | "USDCX";
  onCurrencyClick?: () => void;
  /** Second line on the currency pill, e.g. the network. */
  currencyDetail?: string;
  showBaseLogo?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  userBalance?: string;
  onPercentageClick?: (value: string) => void;
  footer?: React.ReactNode;
}

export function SwapSection({
  label,
  amount,
  onAmountChange,
  currencyType,
  onCurrencyClick,
  currencyDetail,
  disabled = false,
  isLoading = false,
  userBalance,
  onPercentageClick,
  footer,
}: SwapSectionProps) {
  const handlePercent = (percent: number) => {
    if (userBalance === undefined || !onPercentageClick) return;
    const value = parseFloat(userBalance) * percent;
    // Standardize to 6 decimals (USDC/CNGN)
    onPercentageClick(parseFloat(value.toFixed(6)).toString());
  };

  return (
    <div className="ramp-field p-4 lg:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="ramp-label">{label}</span>

        {userBalance !== undefined && onPercentageClick && !disabled && (
          <div className="flex gap-1.5">
            {[0.25, 0.5, 1].map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => handlePercent(percent)}
                className="rounded-md bg-(--r-raised) px-2 py-1 text-xs font-medium text-(--r-muted) transition-colors hover:text-(--r-text)"
              >
                {percent === 1 ? "Max" : `${percent * 100}%`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <AmountInput
          value={amount}
          onChange={onAmountChange}
          disabled={disabled}
          isLoading={isLoading}
          label={label}
        />
        <CurrencySelector type={currencyType} onClick={onCurrencyClick} detail={currencyDetail} />
      </div>

      {userBalance !== undefined && (
        <div className="text-right text-xs text-(--r-muted)">
          Balance{" "}
          <span className="ramp-amount text-(--r-text)">
            {parseFloat(userBalance).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </span>
        </div>
      )}

      {footer && (
        <div className="border-t border-(--r-line) pt-3 text-xs text-(--r-muted)">
          {footer}
        </div>
      )}
    </div>
  );
}
