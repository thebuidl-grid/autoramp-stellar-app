import {
  buildTrack,
  describeTrack,
  type NodeState,
} from "@/components/ui-shared/lifecycle";
import { cn } from "@/lib/utils";

const DOT: Record<NodeState, string> = {
  done: "border-(--r-signal) bg-(--r-signal)",
  current: "border-(--r-signal) bg-(--r-signal)",
  upcoming: "border-(--r-line) bg-transparent",
  failed: "border-(--r-danger) bg-(--r-danger)",
  warn: "border-(--r-caution) bg-(--r-caution)",
};

/**
 * Where a cash-out is, as steps, on the ramp screen. Shown after the customer has sent their USDC, in place of the send button,
 * so a finished "step 2 of 2" never hangs around and the next thing they see is how the payout is going.
 */
export function SellProgressTrack({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  // Before the server has reported anything, the deposit is sent and we are waiting for the network to confirm it.
  const nodes = buildTrack("OFFRAMP", status ?? "DEPOSIT_DETECTED").filter(
    (n) => n.key !== "created" && n.key !== "awaiting",
  );
  const sent = [
    { key: "sent", label: "USDC sent", state: "done" as NodeState },
    ...nodes,
  ];
  return (
    <div className={cn("pt-3", className)}>
      <ol aria-label={describeTrack(sent)} className="space-y-3">
        {sent.map((n, i) => (
          <li
            key={n.key}
            data-state={n.state}
            aria-current={n.state === "current" ? "step" : undefined}
            className="relative flex items-center gap-3"
          >
            {i < sent.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 left-[7px] h-4 w-px",
                  n.state === "done" ? "bg-(--r-signal)" : "bg-(--r-line)",
                )}
              />
            ) : null}
            <span className="relative flex h-4 w-4 items-center justify-center">
              {n.state === "current" ? (
                <span
                  aria-hidden
                  className="absolute h-full w-full rounded-full bg-(--r-signal) opacity-50 motion-safe:animate-ping"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative h-3 w-3 rounded-full border-2",
                  DOT[n.state],
                )}
              />
            </span>
            <span
              className={cn(
                "text-sm",
                n.state === "upcoming" ? "text-(--r-muted)" : "text-(--r-text)",
                n.state === "current" && "font-medium",
              )}
            >
              {n.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
