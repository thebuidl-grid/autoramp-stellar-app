import { cn } from "@/lib/utils";

/** Points for the polyline, scaled to `width` x `height` with a little padding. Pure, so it can be tested. */
export function sparklinePoints(values: number[], width = 96, height = 28, pad = 2): string {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return "";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = clean.length > 1 ? (width - pad * 2) / (clean.length - 1) : 0;
  return clean
    .map((v, i) => {
      const x = pad + i * step;
      // a flat series sits in the middle instead of on the floor
      const y = max === min ? height / 2 : pad + (height - pad * 2) * (1 - (v - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** A tiny trend line. Decorative by default; give it a `label` when the trend is the point ("Volume, last 30 days"). */
export function Sparkline({ values, label, className, width = 96, height = 28 }: { values: number[]; label?: string; className?: string; width?: number; height?: number }) {
  const points = sparklinePoints(values, width, height);
  if (!points) return null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("overflow-visible text-(--c-muted)", className)}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
