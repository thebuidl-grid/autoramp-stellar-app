"use client";

import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export interface BitnobBalanceAccount {
  account_id?: string;
  currency?: string;
  available_balance_formatted?: string;
  ledger_balance_formatted?: string;
}
export interface BitnobTransaction {
  transaction_id?: string;
  trade_id?: string;
  reference?: string;
  type?: string;
  state?: string;
  side?: string;
  currency?: string;
  account_number?: string;
  amount_formatted?: string;
  amount?: string;
  fee_formatted?: string;
  fee?: string;
  metadata?: Record<string, string>;
  value_date?: string;
  created_at?: string;
  updated_at?: string;
}

/** Thrown for any failed call. `message` is the backend's (or Bitnob's) own reason when it gave one. */
export class BitnobError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** The backend answers with Bitnob's `{ success, data }` envelope; unwrap `data`. */
async function load<T>(resource: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  try {
    const { data } = await api.get(`/admin/bitnob/${resource}`, { params });
    return (data?.data ?? data) as T;
  } catch (err) {
    const e = err as AxiosError<{ detail?: string; message?: string | string[]; error?: { message?: string } }>;
    const body = e.response?.data;
    const raw = body?.detail || body?.error?.message || body?.message;
    const msg = Array.isArray(raw) ? raw.join(", ") : raw;
    throw new BitnobError(String(msg || e.message || "Bitnob request failed"), e.response?.status ?? 0);
  }
}

function useBitnob<T>(resource: string, params: Record<string, string | number | undefined> = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery<T, BitnobError>({
    queryKey: ["admin-bitnob", resource, params],
    queryFn: () => load<T>(resource, params),
    enabled: !!token,
    retry: false,
    staleTime: 15_000,
  });
}

export const useBitnobBalances = () => useBitnob<{ accounts?: BitnobBalanceAccount[] }>("balances");
export interface BitnobTransactionFilters {
  /** Exact Bitnob reference, e.g. one of our off_* references. */
  reference?: string;
  /** Bitnob's own direction filter. */
  direction?: "inflow" | "outflow";
}

/** Bitnob allows at most 50 rows per page. */
export const useBitnobTransactions = (cursor?: string, filters: BitnobTransactionFilters = {}, limit = 25) =>
  useBitnob<{ transactions?: BitnobTransaction[]; next_cursor?: string; has_more?: boolean; total_count?: number }>("transactions", {
    limit: Math.min(50, Math.max(1, limit)),
    cursor,
    reference: filters.reference,
    direction: filters.direction,
  });
