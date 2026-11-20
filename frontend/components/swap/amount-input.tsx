"use client";

interface AmountInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  showUsdValue?: boolean;
  usdValue?: number;
  disabled?: boolean;
  isLoading?: boolean;
  /** Accessible name, e.g. "You'll send". */
  label?: string;
}

export function AmountInput({
  value,
  onChange,
  placeholder = "0",
  disabled = false,
  isLoading = false,
  label,
}: AmountInputProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center">
        <div className="w-40 h-10 rounded-lg bg-white/10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="ramp-amount w-full min-w-0 text-4xl md:text-5xl text-(--r-text) bg-transparent border-none outline-none placeholder:text-(--r-muted)/50 disabled:cursor-default [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}
