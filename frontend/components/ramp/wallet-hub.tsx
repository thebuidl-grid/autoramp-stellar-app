"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CopyButton } from "@/components/ramp/processing";

export interface WalletEntry {
  id: string;
  /** Short name used in labels, e.g. "Stellar". EVM uses "wallet". */
  name: string;
  /** Full name used in lists, e.g. "Stellar wallet". */
  title: string;
  /** Short chain tag shown next to a connected address, e.g. "EVM". */
  chain: string;
  hint?: string;
  /** Used by the screen the user is on. Wallets that aren't relevant are only listed once connected. */
  relevant: boolean;
  /** Needed to continue. Optional wallets are only offered quietly. */
  required: boolean;
  connected: boolean;
  connecting?: boolean;
  address?: string | null;
  onConnect: () => void;
  onDisconnect?: () => void;
  /** Open the wallet's own account view (EVM), instead of disconnecting directly. */
  onManage?: () => void;
}

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/**
 * "Your wallets": every wallet the user has connected, on any chain, with copy and disconnect, plus one button to
 * connect the wallet this screen needs. Optional or unrelated wallets are offered quietly (never a second loud
 * button), through "Add a wallet".
 */
export function WalletHub({ entries }: { entries: WalletEntry[] }) {
  const connected = entries.filter((e) => e.connected);
  const missing = entries.filter((e) => !e.connected);
  const neededMissing = missing.filter((e) => e.relevant);
  const requiredMissing = neededMissing.filter((e) => e.required);

  const primary = requiredMissing.length > 0;
  // What the button connects: the required wallets first, then the others this screen can use, then any wallet.
  const offered = primary ? requiredMissing : neededMissing.length > 0 ? neededMissing : missing;
  const single = offered.length === 1 ? offered[0] : null;
  const label = primary
    ? single
      ? `Connect ${single.name}`
      : "Connect wallet"
    : single
      ? `Add ${single.name} wallet`
      : "Add a wallet";

  const button = (
    <button
      type="button"
      className="ramp-connect"
      data-quiet={primary ? undefined : "true"}
      disabled={single?.connecting}
      onClick={single ? single.onConnect : undefined}
    >
      {label}
      {!single && <ChevronDown size={14} aria-hidden />}
    </button>
  );

  return (
    <section className="ramp-field space-y-3 p-4" aria-label="Your wallets">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ramp-label">Your wallets</h3>
          {primary && single?.hint && (
            <p className="mt-0.5 text-xs text-(--r-muted)">{single.hint}</p>
          )}
        </div>

        {offered.length > 0 &&
          (single ? (
            button
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {offered.map((e) => (
                  <DropdownMenuItem key={e.id} onSelect={() => e.onConnect()} className="flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">{e.title}</span>
                    {e.hint && <span className="text-xs text-(--r-muted)">{e.hint}</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
      </div>

      {connected.length > 0 ? (
        <ul className="divide-y divide-(--r-line)">
          {connected.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-6 shrink-0 items-center rounded-md bg-(--r-raised) px-2 text-[11px] font-semibold text-(--r-text)">
                  {e.chain}
                </span>
                <span className="truncate font-mono text-sm text-(--r-text)">{short(e.address)}</span>
                {e.address && (
                  <CopyButton value={e.address} label={`Copy ${e.title} address`} toastText="Address copied" />
                )}
              </span>
              {(e.onManage || e.onDisconnect) && (
                <button
                  type="button"
                  onClick={e.onManage ?? e.onDisconnect}
                  aria-label={e.onManage ? `Manage ${e.title}` : `Disconnect ${e.title}`}
                  className="shrink-0 text-xs text-(--r-muted) underline-offset-2 hover:text-(--r-text) hover:underline"
                >
                  {e.onManage ? "Manage" : "Disconnect"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-(--r-muted)">No wallet connected yet.</p>
      )}

      {requiredMissing.length > 0 && (
        <p className="text-xs text-(--r-muted)">
          {requiredMissing.length === 1
            ? `Connect your ${requiredMissing[0].title} to continue.`
            : "Connect your wallets to continue."}
        </p>
      )}
    </section>
  );
}
