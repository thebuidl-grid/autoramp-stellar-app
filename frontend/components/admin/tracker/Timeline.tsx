import { format } from "date-fns";
import { ProviderBadge, statusTone } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import { formatGap, type TimelineEntry } from "@/lib/tracker";

type Tone = "ok" | "danger" | "live" | "neutral" | "warn";

/** How an entry's node looks: a recorded outcome wins, then a webhook error, then the status it moved to. */
export function entryTone(e: TimelineEntry): Tone {
  if (e.outcome === "FAILED" || e.error) return "danger";
  if (e.outcome === "OK") return "ok";
  if (e.outcome === "RETRY") return "warn";
  if (e.kind === "log" && e.to) {
    const t = statusTone(e.to);
    return t === "ok" ? "ok" : t === "danger" ? "danger" : t === "warn" ? "warn" : t === "live" ? "live" : "neutral";
  }
  return "neutral";
}

const NODE: Record<Tone, string> = {
  ok: "bg-(--c-ok)",
  danger: "bg-(--c-danger)",
  warn: "bg-(--c-warn)",
  live: "bg-(--c-signal)",
  neutral: "bg-(--c-neutral)",
};

const STATE: Record<Tone, string> = { ok: "succeeded", danger: "failed", warn: "retried", live: "in progress", neutral: "" };

function Raw({ value }: { value: unknown }) {
  if (value === undefined || value === null) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)">Raw details</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded-(--c-radius) bg-(--c-field) p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

/** Everything that happened, oldest first. Each row shows when, the gap since the previous step, and expandable raw data. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol aria-label="What happened, oldest first" className="relative space-y-0">
      {entries.map((e, i) => {
        const tone = entryTone(e);
        const prev = entries[i - 1];
        const gap = prev ? new Date(e.at).getTime() - new Date(prev.at).getTime() : null;
        const last = i === entries.length - 1;
        return (
          <li key={`${e.at}-${i}`} data-tone={tone} className="relative flex gap-3 pb-4">
            {!last ? <span aria-hidden className="absolute top-3 bottom-0 left-[5px] w-px bg-(--c-line)" /> : null}
            <span aria-hidden className={cn("relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-(--c-bg)", NODE[tone])} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{e.title}</span>
                {STATE[tone] ? <span className="sr-only">({STATE[tone]})</span> : null}
                {e.provider && e.kind !== "leg" && e.kind !== "webhook" ? <ProviderBadge provider={e.provider} /> : null}
                <time dateTime={e.at} className="text-xs text-(--c-muted)" title={e.at}>
                  {format(new Date(e.at), "MMM d, HH:mm:ss")}
                </time>
                {gap !== null && gap >= 1000 ? <span className="text-xs text-(--c-muted) tabular-nums">{formatGap(gap)}</span> : null}
              </p>
              {e.description ? <p className="text-(--c-muted)">{e.description}</p> : null}
              {e.kind === "webhook" ? (
                <p className="text-xs text-(--c-muted)">
                  {e.processed ? "Processed" : "Not processed"}
                  {e.error ? <span className="text-(--c-danger)"> · {e.error}</span> : null}
                </p>
              ) : null}
              <Raw value={e.detail} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
