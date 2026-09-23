"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { swapApi, getErrorMessage } from "@/lib/api";
import { useStellarWallet } from "./use-stellar-wallet";
import { useUpdateSwapAfterExecution } from "./use-swap";
import { useToast } from "@/components/ui/toast";
import { buildPathPaymentXdr, submitSignedXdr, accountExists, fundTestnetAccount, IS_MAINNET } from "@/lib/stellar-tx";
import type { TabType, StepType } from "./use-transaction-form";

export interface UseSwapExecutionProps {
  swapData: any;
  step: StepType;
  activeTab: TabType;
  setStep: (step: StepType) => void;
  setSwapData: (data: any) => void;
}

export interface UseSwapExecutionReturn {
  needsTrustline: boolean;
  isCheckingTrustline: boolean;
  isAddingTrustline: boolean;
  // A Stellar account doesn't exist on-chain until it's first funded — a
  // brand-new wallet hits this, not a trustline issue. Only meaningfully
  // actionable on testnet (via Friendbot); on mainnet this just explains
  // why signing would otherwise fail with a cryptic Horizon "Not Found".
  needsFunding: boolean;
  isCheckingAccountExists: boolean;
  isFundingAccount: boolean;
  canFundViaFriendbot: boolean;
  // False until funding + trustline status are both conclusively known —
  // use this to keep the swap button non-clickable during that window.
  checksReady: boolean;
  isExecuting: boolean;
  isSwapSuccess: boolean;
  swapHash: string | undefined;
  handleAddTrustline: () => void;
  handleFundAccount: () => void;
  handleExecuteSwap: () => void;
}

/**
 * Swap execution on Stellar: build a PathPaymentStrictSend, sign it with
 * the connected wallet, submit to Horizon, report the hash back to the
 * backend. Replaces wagmi's approve+exactInputSingle+waitForReceipt flow —
 * there's no allowance/approval concept on Stellar (replaced by the
 * trustline check below), and submitTransaction already waits for ledger
 * inclusion, so no separate "waiting for receipt" step is needed.
 */
export function useSwapExecution({
  swapData,
  step,
  activeTab,
  setStep,
}: UseSwapExecutionProps): UseSwapExecutionReturn {
  const { toast } = useToast();
  const { address, signTransaction } = useStellarWallet();
  const updateSwap = useUpdateSwapAfterExecution();

  // The app-level token type (e.g. "BRIDGE_USDC"), NOT the raw Stellar
  // asset code from swapParams.destAsset.code ("USDC") — that code is
  // ambiguous between AutoRamp's self-issued USDC and Circle's real
  // bridge-compatible USDC (same code, different issuer). Using the raw
  // code here silently checked/sponsored a trustline for the WRONG asset
  // whenever the destination was BRIDGE_USDC — the swap itself then still
  // targeted the real one (via the full {code,issuer} pair) and failed
  // with a confusing op_no_trust, even after "successfully" adding a
  // trustline for the ordinary USDC the user already had.
  const destAssetCode: string | undefined = swapData?.swap?.toTokenType;

  const {
    data: accountExistsData,
    isLoading: isCheckingAccountExists,
    refetch: refetchAccountExists,
  } = useQuery({
    queryKey: ["accountExists", address],
    queryFn: () => accountExists(address as string),
    enabled: !!address && step === "execute",
  });
  const needsFunding = accountExistsData === false;

  const {
    data: trustlineData,
    isLoading: isCheckingTrustline,
    refetch: refetchTrustline,
  } = useQuery({
    queryKey: ["trustline", destAssetCode, address],
    queryFn: () => swapApi.hasTrustline(destAssetCode as string, address as string),
    // Checking a trustline loads the account too — for a brand-new,
    // unfunded account this would fail the same way the swap itself
    // would, so wait until we've confirmed the account exists first
    // rather than surfacing a second confusing error.
    enabled: !!address && !!destAssetCode && step === "execute" && accountExistsData === true,
  });
  const needsTrustline = trustlineData ? !trustlineData.data.hasTrustline : false;
  // True only once we've conclusively resolved both checks — `isLoading`
  // alone isn't enough, since a query that hasn't started yet (still
  // `enabled: false` waiting on a prerequisite) reports isLoading: false
  // too, which previously let the button look clickable before we
  // actually knew whether funding/trustline were needed.
  const checksReady = accountExistsData !== undefined && (accountExistsData === false || trustlineData !== undefined);

  const [isAddingTrustline, setIsAddingTrustline] = useState(false);
  const [isFundingAccount, setIsFundingAccount] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSwapSuccess, setIsSwapSuccess] = useState(false);
  const [swapHash, setSwapHash] = useState<string | undefined>(undefined);
  const hasUpdatedSwap = useRef(false);

  const handleAddTrustline = useCallback(async () => {
    if (!address || !destAssetCode) return;
    setIsAddingTrustline(true);
    try {
      // Backend builds + partially signs (as sponsor) — AutoRamp covers the
      // reserve, the user just signs and pays the negligible base fee.
      const { data } = await swapApi.getSponsoredTrustline(destAssetCode, address);
      const signedXdr = await signTransaction(data.xdr);
      await submitSignedXdr(signedXdr);
      await refetchTrustline();
      toast({
        title: "Trustline added",
        description: `You can now receive ${destAssetCode}.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to add trustline",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsAddingTrustline(false);
    }
  }, [address, destAssetCode, signTransaction, refetchTrustline, toast]);

  const handleFundAccount = useCallback(async () => {
    if (!address) return;
    setIsFundingAccount(true);
    try {
      await fundTestnetAccount(address);
      await refetchAccountExists();
      toast({
        title: "Wallet funded",
        description: "Friendbot sent 10,000 testnet XLM to your wallet.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to fund wallet",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsFundingAccount(false);
    }
  }, [address, refetchAccountExists, toast]);

  const handleExecuteSwap = useCallback(async () => {
    if (!address || !swapData?.swapParams) return;
    setIsExecuting(true);
    try {
      const { sendAsset, sendAmount, destAsset, destMin, destination, memo } =
        swapData.swapParams;

      // Re-verify funding + trustline fresh, synchronously, right before
      // building/submitting — rather than trusting the React Query state
      // above, which can still be unsettled (not yet loaded, not just
      // "loaded and false") if this fires before those checks finish.
      // That race is exactly what let a swap through with no trustline
      // and fail with a cryptic op_no_trust instead of a clear message.
      const exists = await accountExists(address);
      if (!exists) {
        await refetchAccountExists();
        throw new Error("This wallet doesn't exist on-chain yet — fund it with XLM first, then retry.");
      }
      if (destAsset.issuer) {
        // Native XLM never needs a trustline; anything else might. Uses
        // destAssetCode (the app-level token type, e.g. "BRIDGE_USDC"),
        // NOT destAsset.code (the raw Stellar code "USDC", ambiguous
        // between two different real assets) — see destAssetCode's own
        // comment above for why that distinction matters here.
        const { data: trustline } = await swapApi.hasTrustline(destAssetCode as string, address);
        if (!trustline.hasTrustline) {
          await refetchTrustline();
          throw new Error(`This wallet doesn't have a trustline for ${destAssetCode} yet — add the trustline first, then retry.`);
        }
      }

      const xdr = await buildPathPaymentXdr({
        sourcePublicKey: address,
        sendAsset,
        sendAmount,
        destAsset,
        destMin,
        destination,
        memo,
      });
      const signedXdr = await signTransaction(xdr);
      const hash = await submitSignedXdr(signedXdr);

      setSwapHash(hash);
      setIsSwapSuccess(true);

      if (!hasUpdatedSwap.current) {
        hasUpdatedSwap.current = true;
        updateSwap.mutate(
          {
            reference: swapData.swap.reference,
            data: { transactionHash: hash, sourceAddress: address },
          },
          {
            onSuccess: () => {
              // For swap tab, mark as completed immediately (no WebSocket needed)
              // For sell tab, go to pending state (uses WebSocket for offramp updates)
              if (activeTab === "swap") {
                setStep("completed");
                toast({
                  title: "Swap Completed",
                  description: "Your swap transaction has been completed successfully!",
                  variant: "default",
                });
              } else {
                setStep("pending");
              }
            },
            onError: () => {
              hasUpdatedSwap.current = false;
            },
          }
        );
      }
    } catch (error: any) {
      toast({
        title: "Swap Failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  }, [address, swapData, destAssetCode, signTransaction, updateSwap, activeTab, toast, setStep, refetchAccountExists, refetchTrustline]);

  return {
    needsTrustline,
    isCheckingTrustline,
    isAddingTrustline,
    needsFunding,
    isCheckingAccountExists,
    isFundingAccount,
    canFundViaFriendbot: !IS_MAINNET,
    checksReady,
    isExecuting,
    isSwapSuccess,
    swapHash,
    handleAddTrustline,
    handleFundAccount,
    handleExecuteSwap,
  };
}
