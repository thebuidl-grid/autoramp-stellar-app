"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { stablestackApi } from "@/lib/api";
import { viewFromLegacy } from "@/lib/offramp-status";
import { OfframpDetailView } from "./offramp-detail-view";

/**
 * Loads an off-ramp's persisted state from the API and renders it. State lives on the server, so it is
 * identical after a page refresh or a later login. Works with the upgraded backend (`view`) and with the
 * older { transaction, history } response.
 */
export function OfframpDetailLoader({ reference, compact = false }: { reference: string; compact?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["offramp-detail", reference],
    queryFn: async () => (await stablestackApi.getOfframpDetail(reference)).data,
    retry: false,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/50" data-testid="offramp-detail-loading">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading transaction details…
      </div>
    );
  }
  const view = data?.view ?? (data?.transaction ? viewFromLegacy(data.transaction, data.history ?? []) : null);
  if (error || !view) {
    return (
      <p className="text-xs text-red-300" data-testid="offramp-detail-error">
        Could not load this transaction&apos;s details. Please refresh, or contact support with your reference.
      </p>
    );
  }
  return <OfframpDetailView view={view} compact={compact} />;
}
