"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * When did any data on this screen last load successfully? Newest `dataUpdatedAt` across the query cache, or undefined if
 * nothing has loaded. Used for the "Updated 12s ago" label so a stale dashboard cannot pass for a live one.
 */
export function useLastUpdated(): number | undefined {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const read = () => {
    let newest = 0;
    for (const q of cache.getAll()) {
      if (q.state.status === "success" && q.state.dataUpdatedAt > newest) newest = q.state.dataUpdatedAt;
    }
    return newest;
  };
  const newest = useSyncExternalStore(
    (notify) => cache.subscribe(notify),
    read,
    () => 0,
  );
  return newest || undefined;
}
