import { useState, useEffect, useRef } from "react";
import { useResolveAccount } from "./use-transactions";

export interface UseAccountResolutionProps {
  activeTab: "buy" | "sell" | "swap";
  bankCode: string;
  accountNumber: string;
}

export interface UseAccountResolutionReturn {
  accountName: string | null;
  accountResolved: boolean;
  resolveAccount: ReturnType<typeof useResolveAccount>;
}

/**
 * Hook to handle account resolution with debouncing
 * Triggers account name resolution when account number reaches 10 digits
 * Prevents multiple requests by using debouncing and tracking last resolved combination
 */
export function useAccountResolution({
  activeTab,
  bankCode,
  accountNumber,
}: UseAccountResolutionProps): UseAccountResolutionReturn {
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountResolved, setAccountResolved] = useState(false);
  const resolveAccount = useResolveAccount();
  
  const lastResolvedRef = useRef<{ bankCode: string; accountNumber: string } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Reset state if account number is not 10 digits or not in sell tab
    if (activeTab !== "sell" || !bankCode || accountNumber.length !== 10) {
      if (accountNumber.length !== 10) {
        setAccountName(null);
        setAccountResolved(false);
        lastResolvedRef.current = null;
      }
      return;
    }

    // Check if this combination was already resolved
    const combination = `${bankCode}-${accountNumber}`;
    const lastCombination = lastResolvedRef.current 
      ? `${lastResolvedRef.current.bankCode}-${lastResolvedRef.current.accountNumber}`
      : null;

    // If already resolved this combination, don't resolve again
    if (combination === lastCombination) {
      return;
    }

    // Don't trigger if a request is already pending
    if (resolveAccount.isPending) {
      return;
    }

    // Debounce the resolution request by 500ms
    timeoutRef.current = setTimeout(() => {
      // Double-check conditions after debounce delay
      if (
        activeTab === "sell" && 
        bankCode && 
        accountNumber.length === 10 && 
        !resolveAccount.isPending
      ) {
        const currentCombination = `${bankCode}-${accountNumber}`;
        const currentLastCombination = lastResolvedRef.current 
          ? `${lastResolvedRef.current.bankCode}-${lastResolvedRef.current.accountNumber}`
          : null;

        // Only resolve if this combination hasn't been resolved yet
        if (currentCombination !== currentLastCombination) {
          lastResolvedRef.current = { bankCode, accountNumber };
          resolveAccount.mutate(
            { bankCode, accountNumber },
            {
              onSuccess: (response) => {
                const resolvedName = response.data?.data?.accountName;
                if (resolvedName) {
                  setAccountName(resolvedName);
                  setAccountResolved(true);
                } else {
                  setAccountName(null);
                  setAccountResolved(false);
                  lastResolvedRef.current = null;
                }
              },
              onError: () => {
                setAccountName(null);
                setAccountResolved(false);
                lastResolvedRef.current = null;
              },
            }
          );
        }
      }
    }, 500); // 500ms debounce delay

    // Cleanup function to clear timeout on unmount or dependency change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [accountNumber, bankCode, activeTab, resolveAccount.isPending, resolveAccount.mutate]);

  return {
    accountName,
    accountResolved,
    resolveAccount,
  };
}

