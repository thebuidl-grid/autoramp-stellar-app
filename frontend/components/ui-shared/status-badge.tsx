import { cn } from "@/lib/utils";
import { statusLabel, statusTone, type StatusTone } from "./status";

const TONE_CLASS: Record<StatusTone, { chip: string; dot: string }> = {
  ok: { chip: "text-(--c-ok) bg-[color-mix(in_oklab,var(--c-ok)_14%,transparent)]", dot: "bg-(--c-ok)" },
  warn: { chip: "text-(--c-warn) bg-[color-mix(in_oklab,var(--c-warn)_14%,transparent)]", dot: "bg-(--c-warn)" },
  danger: { chip: "text-(--c-danger) bg-[color-mix(in_oklab,var(--c-danger)_14%,transparent)]", dot: "bg-(--c-danger)" },
  neutral: { chip: "text-(--c-muted) bg-(--c-field)", dot: "bg-(--c-neutral)" },
  live: { chip: "text-(--c-signal-text) bg-[color-mix(in_oklab,var(--c-signal)_14%,transparent)]", dot: "bg-(--c-signal) motion-safe:animate-pulse" },
};

/** One status pill for every table and detail page. Always carries its label, so colour is never the only signal. */
export function StatusBadge({ status, label, tone: toneOverride, className }: { status: string | null | undefined; label?: string; tone?: StatusTone; className?: string }) {
  // `tone` is for the few places where a status needs a different weight than the shared map gives it (e.g. "pending review").
  const tone = toneOverride ?? statusTone(status);
  const styles = TONE_CLASS[tone];
  return (
    <span
      data-tone={tone}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", styles.chip, className)}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
      {label ?? statusLabel(status)}
    </span>
  );
}
