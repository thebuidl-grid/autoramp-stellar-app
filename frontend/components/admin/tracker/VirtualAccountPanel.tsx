import { format } from "date-fns";
import { CopyableId, DetailList, Money, StatusBadge } from "@/components/ui-shared";
import type { TraceVirtualAccount } from "@/lib/tracker";

const when = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy HH:mm") : null);

/**
 * The Safehaven account that collected an NGN payment (an on-ramp's deposit account, or the account an off-ramp's naira landed in): who it
 * is, whether it is still open, what was credited and forwarded, and every event on it.
 * Events that belong to a different transaction are marked, because an account can be paid more than once.
 */
export function VirtualAccountPanel({ account, transactionId, currency }: { account: TraceVirtualAccount; transactionId: string; currency?: string | null }) {
  const items = [
    { label: "Account number", value: <CopyableId value={account.accountNumber} label="account number" /> },
    ...(account.accountName ? [{ label: "Account name", value: account.accountName }] : []),
    ...(account.bankName ? [{ label: "Bank", value: account.bankCode ? `${account.bankName} (${account.bankCode})` : account.bankName }] : []),
    ...(account.status ? [{ label: "Status", value: <StatusBadge status={account.status} /> }] : []),
    ...(account.expectedAmount ? [{ label: "Created to receive", value: <Money value={account.expectedAmount} currency={currency ?? "NGN"} maxFraction={2} minFraction={2} /> }] : []),
    ...(account.createdAt ? [{ label: "Created", value: when(account.createdAt) }] : []),
    ...(account.expiresAt ? [{ label: "Expires", value: when(account.expiresAt) }] : []),
    ...(account.credited ? [{ label: "Credited to this account", value: <Money value={account.credited} currency="NGN" maxFraction={2} minFraction={2} /> }] : []),
    ...(account.forwardReference ? [{ label: "Forwarded to the customer as", value: <CopyableId value={account.forwardReference} label="forward reference" /> }] : []),
    ...(account.reference ? [{ label: "Our reference", value: <CopyableId value={account.reference} label="virtual account reference" /> }] : []),
    ...(account.externalReference ? [{ label: "Safehaven reference", value: <CopyableId value={account.externalReference} label="Safehaven reference" /> }] : []),
  ];
  return (
    <div className="overflow-hidden rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
      <div className="px-(--c-pad)">
        <DetailList items={items} />
      </div>
      <div className="border-t border-(--c-line) px-(--c-pad) py-3">
        <h3 className="mb-2 font-medium">Activity on this account</h3>
        {account.activity.length === 0 ? (
          <p className="text-(--c-muted)">Nothing has been paid into or out of this account yet.</p>
        ) : (
          <ul className="divide-y divide-(--c-line)">
            {account.activity.map((e) => {
              const other = e.transactionId && e.transactionId !== transactionId;
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium">{e.eventType ?? "Event"}</p>
                    <p className="text-xs text-(--c-muted)">
                      {format(new Date(e.createdAt), "MMM d, HH:mm:ss")}
                      {other ? " · belongs to another transaction" : e.transactionId ? "" : " · not matched to a transaction"}
                      {!e.processed ? " · not processed" : ""}
                    </p>
                    {e.errorMessage ? <p className="text-xs text-(--c-danger)">{e.errorMessage}</p> : null}
                  </div>
                  {e.status ? <StatusBadge status={e.status} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
