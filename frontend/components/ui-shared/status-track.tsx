import { cn } from "@/lib/utils";
import { buildTrack, describeTrack, type NodeState, type TrackKind } from "./lifecycle";

const NODE: Record<NodeState, string> = {
  done: "bg-(--c-ok) border-(--c-ok)",
  current: "bg-(--c-signal) border-(--c-signal)",
  upcoming: "bg-transparent border-(--c-line)",
  failed: "bg-(--c-danger) border-(--c-danger)",
  warn: "bg-(--c-warn) border-(--c-warn)",
};

const LABEL: Record<NodeState, string> = {
  done: "text-(--c-muted)",
  current: "text-(--c-text) font-medium",
  upcoming: "text-(--c-muted)/70",
  failed: "text-(--c-danger) font-medium",
  warn: "text-(--c-warn) font-medium",
};

/**
 * A transaction's progress as nodes on a line. Finished steps are filled, the live step pulses (only when motion is allowed),
 * a failed step is marked where it stopped. `compact` drops the labels for table rows and keeps them for screen readers.
 */
export function StatusTrack({
  kind,
  status,
  reachedStatus,
  compact,
  className,
}: {
  kind: TrackKind | string | null | undefined;
  status: string | null | undefined;
  reachedStatus?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const nodes = buildTrack(kind, status, { reachedStatus });
  const summary = describeTrack(nodes);

  return (
    <ol aria-label={summary} className={cn("flex items-start", compact ? "gap-0" : "w-full", className)}>
      {nodes.map((node, i) => {
        const filled = node.state === "done" || node.state === "current" || node.state === "failed" || node.state === "warn";
        const lineDone = node.state === "done";
        return (
          <li
            key={node.key}
            aria-current={node.state === "current" ? "step" : undefined}
            data-state={node.state}
            className={cn("flex items-start", !compact && i < nodes.length - 1 && "flex-1")}
          >
            <div className="flex flex-col items-center gap-1.5">
              <span className="relative flex h-3 w-3 items-center justify-center">
                {node.state === "current" ? (
                  <span aria-hidden className="absolute inline-flex h-full w-full rounded-full bg-(--c-signal) opacity-60 motion-safe:animate-ping" />
                ) : null}
                <span aria-hidden className={cn("relative h-3 w-3 rounded-full border-2 transition-colors duration-300", NODE[node.state])}>
                  {node.state === "failed" ? <span className="absolute inset-0 flex items-center justify-center text-[8px] leading-none font-bold text-(--c-bg)">×</span> : null}
                </span>
              </span>
              {compact ? <span className="sr-only">{`${node.label}: ${node.state}`}</span> : <span className={cn("max-w-24 text-center text-xs leading-tight", LABEL[node.state])}>{node.label}</span>}
            </div>
            {i < nodes.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "mt-[5px] h-0.5 rounded-full transition-colors duration-500",
                  compact ? "w-3" : "mx-1 flex-1",
                  lineDone && filled ? "bg-(--c-ok)" : "bg-(--c-line)",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
