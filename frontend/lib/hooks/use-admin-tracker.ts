"use client";

import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { adminApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/** The status of a failed request, so pages can tell "not found" from "broken". */
export function errorStatus(error: unknown): number | undefined {
  return (error as AxiosError | null | undefined)?.response?.status;
}

export function errorMessage(error: unknown): string | undefined {
  const e = error as AxiosError<{ message?: string | string[] }> | null | undefined;
  const raw = e?.response?.data?.message;
  return (Array.isArray(raw) ? raw.join(", ") : raw) ?? e?.message;
}

/** One transaction end to end. A 404 means "no such reference". */
export function useTrace(reference: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-trace", reference],
    queryFn: async () => (await adminApi.getTrace(reference)).data,
    enabled: !!token && !!reference,
    retry: false, // a 404 is an answer, and a failure shows right away with a Try again button
    staleTime: 15_000,
  });
}

export function useStuckTransactions(params: { type?: string; provider?: string; includeAbandoned?: boolean; limit: number; offset: number }, enabled = true) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-stuck", params],
    queryFn: async () => (await adminApi.getStuckTransactions(params)).data,
    enabled: !!token && enabled,
    staleTime: 15_000,
  });
}

export function useFailedTransactions(params: { type?: string; provider?: string; limit: number; offset: number }, enabled = true) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-failed", params],
    queryFn: async () => (await adminApi.getFailedTransactions(params)).data,
    enabled: !!token && enabled,
    staleTime: 15_000,
  });
}

/** Failed / stuck / unmatched-webhook counts for the dashboard. */
export function useAttentionCounts() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-attention"],
    queryFn: async () => (await adminApi.getAttentionCounts()).data,
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useWebhooks(params: { provider?: string; matched?: boolean; processed?: boolean; limit: number; offset: number }) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-webhooks", params],
    queryFn: async () => (await adminApi.getWebhooks(params)).data,
    enabled: !!token,
    staleTime: 15_000,
  });
}

export function useWebhook(id: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-webhook", id],
    queryFn: async () => (await adminApi.getWebhook(id!)).data,
    enabled: !!token && !!id,
  });
}
