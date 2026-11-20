"use client";

import { AmountInput } from "./amount-input";
import { ChainSelector } from "./chain-selector";
import { CurrencySelector } from "./currency-selector";

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
    onPercentageClick(parseFloat(value.toFixed(6)).toString());
  };

  return (
    <div className="ramp-field space-y-3 p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="ramp-label">{label}</span>

        {userBalance !== undefined && onPercentageClick && !disabled && direction === "from" && (
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
        {direction === "from" ? (
          <AmountInput
            value={amount}
            onChange={onAmountChange}
            disabled={disabled}
            isLoading={isLoading}
            label={label}
          />
        ) : (
          <div className="ramp-amount min-w-0 flex-1 truncate text-4xl text-(--r-text) md:text-5xl">
            {amount || <span className="text-(--r-muted)/50">0</span>}
          </div>
        )}
        <CurrencySelector type="USDC" />
      </div>

      <ChainSelector
        chain={chain}
        onClick={onChainClick}
        label={direction === "from" ? "From network" : "To network"}
      />

      {userBalance !== undefined && direction === "from" && (
        <div className="text-right text-xs text-(--r-muted)">
          Balance{" "}
          <span className="ramp-amount text-(--r-text)">
            {parseFloat(userBalance).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </span>{" "}
          USDC
        </div>
      )}
    </div>
  );
}
