import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A native select in the dashboard theme. Native on purpose: it works with the keyboard and screen readers with no extra code, and
 * (unlike a portalled menu) it needs no theme handling. Always give it a `label`; it is announced even when visually hidden.
 */
export function SelectField({ label, options, className, ...props }: { label: string; options: Array<{ value: string; label: string }> } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        {...props}
        className={cn(
          "h-8 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-2 text-(--c-text) focus-visible:border-(--c-signal) focus-visible:outline-none",
          className,
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
