/**
 * Transaction Form Hook
 * 
 * This hook is now a simple wrapper around the Zustand store.
 * You can use useTransactionStore directly, or use this hook for backwards compatibility.
 */

import { useTransactionStore } from "@/lib/store";

// Re-export types for backwards compatibility
export type { TabType, CryptoType, StepType } from "@/lib/store";

// Re-export the store hook
export { useTransactionStore };

// Backwards compatibility wrapper
export const useTransactionForm = () => {
  return useTransactionStore();
};

