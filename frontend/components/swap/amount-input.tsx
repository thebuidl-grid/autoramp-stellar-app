"use client";

interface AmountInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  showUsdValue?: boolean;
  usdValue?: number;
  disabled?: boolean;
  isLoading?: boolean;
}

export function AmountInput({
  value,
  onChange,
  placeholder = "0.00",
  disabled = false,
  isLoading = false,
}: AmountInputProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center">
        <div className="w-48 h-12 bg-white/10 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex-1">
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full text-2xl md:text-4xl font-light text-white bg-transparent border-none outline-none placeholder:text-white/30 disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}
