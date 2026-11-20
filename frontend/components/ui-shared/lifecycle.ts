import { normalizeStatusKey, statusTone } from "./status";

/**
 * The steps a transaction moves through, so a status can be drawn as nodes on a line.
 * `states` lists every status that counts as being AT that step (the off-ramp state machine also uses PROCESSING and the
 * public 3-state PENDING/COMPLETED/FAILED view).
 */
export interface LifecycleStep {
  key: string;
  label: string;
  states: string[];
}

export type TrackKind = "OFFRAMP" | "ONRAMP" | "SWAP" | "OTC" | "BRIDGE" | "VAS";

const OFFRAMP: LifecycleStep[] = [
  { key: "created", label: "Created", states: ["INITIATED", "PENDING"] },
  { key: "awaiting", label: "Awaiting deposit", states: ["AWAITING_DEPOSIT"] },
  { key: "received", label: "Deposit received", states: ["DEPOSIT_DETECTED"] },
  { key: "processing", label: "Processing", states: ["PROCESSING", "CONVERSION_PENDING"] },
  { key: "payout", label: "Paying out", states: ["PAYOUT_PENDING", "PARTIALLY_SETTLED", "INSUFFICIENT_LIQUIDITY"] },
  { key: "done", label: "Paid", states: ["COMPLETED", "SUCCESS"] },
];

const SIMPLE = (first: string, middle: string, last: string): LifecycleStep[] => [
  { key: "created", label: first, states: ["INITIATED", "PENDING"] },
  { key: "processing", label: middle, states: ["PROCESSING"] },
  { key: "done", label: last, states: ["COMPLETED", "SUCCESS"] },
];

const LIFECYCLES: Record<TrackKind, LifecycleStep[]> = {
  OFFRAMP,
  ONRAMP: SIMPLE("Awaiting payment", "Converting", "Delivered"),
  SWAP: SIMPLE("Created", "Swapping", "Completed"),
  OTC: SIMPLE("Requested", "Processing", "Completed"),
  BRIDGE: SIMPLE("Started", "In transit", "Delivered"),
  VAS: SIMPLE("Created", "Processing", "Delivered"),
};

export type NodeState = "done" | "current" | "upcoming" | "failed" | "warn";

export interface TrackNode {
  key: string;
  label: string;
  state: NodeState;
}

export function lifecycleFor(kind: TrackKind | string | null | undefined): LifecycleStep[] {
  const key = String(kind ?? "").toUpperCase() as TrackKind;
  return LIFECYCLES[key] ?? LIFECYCLES.SWAP;
}

function indexOfState(steps: LifecycleStep[], status: string): number {
  return steps.findIndex((s) => s.states.includes(status));
}

/**
 * Turns (type, status) into nodes.
 * - A status on the line makes everything before it "done" and that step "current" (or "done" for the last step).
 * - A failure/warning status (FAILED, EXPIRED, PARTIALLY_SETTLED, ...) marks the step where it stopped: pass `reachedStatus`
 *   (the last status it was in before stopping, e.g. from the trace timeline). Without it the failure is placed on the step after
 *   the first, because we know it started but not how far it got. Nodes after it stay "upcoming".
 */
export function buildTrack(kind: TrackKind | string | null | undefined, status: string | null | undefined, opts: { reachedStatus?: string | null } = {}): TrackNode[] {
  const steps = lifecycleFor(kind);
  const key = normalizeStatusKey(status);
  const onLine = indexOfState(steps, key);
  const tone = statusTone(status);
  const last = steps.length - 1;

  // The step a stalled/failed transaction was on.
  const stoppedAt = () => {
    const reached = indexOfState(steps, normalizeStatusKey(opts.reachedStatus));
    if (reached >= 0) return reached;
    return Math.min(1, last - 1);
  };

  return steps.map((step, i): TrackNode => {
    let state: NodeState;
    if (onLine >= 0 && (tone === "ok" || tone === "live" || tone === "neutral")) {
      state = i < onLine ? "done" : i === onLine ? (i === last ? "done" : "current") : "upcoming";
    } else if (onLine >= 0 && tone === "warn") {
      // a partial/insufficient-liquidity status sits on its own step: it needs attention there
      state = i < onLine ? "done" : i === onLine ? "warn" : "upcoming";
    } else if (tone === "danger" || tone === "warn") {
      const at = stoppedAt();
      state = i < at ? "done" : i === at ? (tone === "danger" ? "failed" : "warn") : "upcoming";
    } else {
      state = i === 0 ? "current" : "upcoming";
    }
    return { key: step.key, label: step.label, state };
  });
}

/** One-line summary for screen readers and tooltips: "Step 4 of 6: Processing" / "Stopped at Processing". */
export function describeTrack(nodes: TrackNode[]): string {
  const stopped = nodes.find((n) => n.state === "failed" || n.state === "warn");
  if (stopped) return `${stopped.state === "failed" ? "Failed" : "Needs attention"} at ${stopped.label}`;
  const current = nodes.findIndex((n) => n.state === "current");
  if (current >= 0) return `Step ${current + 1} of ${nodes.length}: ${nodes[current].label}`;
  return nodes.every((n) => n.state === "done") ? `Done: ${nodes[nodes.length - 1].label}` : `Step 1 of ${nodes.length}: ${nodes[0].label}`;
}
