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

export function useAccountResolution({
  activeTab,
  bankCode,
  accountNumber,
}: UseAccountResolutionProps): UseAccountResolutionReturn {
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountResolved, setAccountResolved] = useState(false);
  const resolveAccount = useResolveAccount();
  
  const lastResolvedRef = useRef<{ bankCode: string; accountNumber: string } | null>(null);

  useEffect(() => {
    const combination = `${bankCode}-${accountNumber}`;
    const lastCombination = lastResolvedRef.current 
      ? `${lastResolvedRef.current.bankCode}-${lastResolvedRef.current.accountNumber}`
      : null;

    if (
      activeTab === "sell" && 
      bankCode && 
      accountNumber.length === 10 && 
      !resolveAccount.isPending &&
      combination !== lastCombination
    ) {
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
            }
          },
          onError: () => {
            setAccountName(null);
            setAccountResolved(false);
            lastResolvedRef.current = null;
          },
        }
      );
    } else if (accountNumber.length !== 10) {
      setAccountName(null);
      setAccountResolved(false);
      lastResolvedRef.current = null;
    }
  }, [accountNumber, bankCode, activeTab, resolveAccount]);

  return {
    accountName,
    accountResolved,
    resolveAccount,
  };
}

