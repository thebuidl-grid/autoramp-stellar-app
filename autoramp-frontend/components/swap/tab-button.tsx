"use client";

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function TabButton({ label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-4 rounded-xl font-medium text-xs md:text-sm transition-colors duration-300 ${
        isActive
          ? "bg-secondary text-black"
          : "bg-black/50 text-white/60 border border-white/10"
      }`}
    >
      {label}
    </button>
  );
}

