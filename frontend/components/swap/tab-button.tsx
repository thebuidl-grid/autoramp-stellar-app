"use client";

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

/** One segment of the ramp tabs. Style comes from `.ramp-seg-item` (see globals.css). */
export function TabButton({ label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="ramp-seg-item"
    >
      {label}
    </button>
  );
}
