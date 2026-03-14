import { useCallback } from "react";
import { parseFormattedNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useOffRamp, useOnRamp } from "./use-transactions";
import { useInitializeSwap, useCreateSimpleSwap } from "./use-swap";
import { SWAP_CONSTANTS } from "@/lib/constants/swap-constants";
import type { TabType, CryptoType, StepType } from "./use-transaction-form";

interface UseTransactionHandlersProps {
  activeTab: TabType;
  cryptoType: CryptoType;
  fromCryptoType: CryptoType;
  toCryptoType: CryptoType;
  sellAmount: string;
  buyAmount: string;
  bankCode: string;
  accountNumber: string;
  walletAddress: string;
  accountResolved: boolean;
  accountName: string | null;
  isConnected: boolean;
  address: `0x${string}` | undefined;
  ngnEstimate?: { estimatedNgn?: number; usdNgnRate?: number };
  setIsAuthModalOpen: (open: boolean) => void;
  setTransactionData: (data: any) => void;
  setSwapData: (data: any) => void;
  setStep: (step: StepType) => void;
}

export function useTransactionHandlers({
  activeTab,
  cryptoType,
  fromCryptoType,
  toCryptoType,
  sellAmount,
  buyAmount,
  bankCode,
  accountNumber,
  walletAddress,
  accountResolved,
  accountName,
  isConnected,
  address,
  ngnEstimate,
  setIsAuthModalOpen,
  setTransactionData,
  setSwapData,
  setStep,
}: UseTransactionHandlersProps) {
  const { toast } = useToast();
  const offRamp = useOffRamp();
  const onRamp = useOnRamp();
  const initializeSwap = useInitializeSwap();
  const createSimpleSwap = useCreateSimpleSwap();

  const isAuthenticated = useCallback(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("token");
  }, []);

  const handleSell = useCallback(async () => {
    if (!isAuthenticated()) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!sellAmount || !bankCode || !accountNumber) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!accountResolved || !accountName) {
      toast({
        title: "Invalid account",
        description: "Please ensure the account number is valid and resolved",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFormattedNumber(sellAmount);
    if (cryptoType === "CNGN" && parsedAmount < 100) {
      toast({
        title: "Invalid amount",
        description: "Minimum amount for CNGN is 100",
        variant: "destructive",
      });
      return;
    }
    if (cryptoType === "USDC" && parsedAmount < 1) {
      toast({
        title: "Invalid amount",
        description: "Minimum amount for USDC is 1",
        variant: "destructive",
      });
      return;
    }
    if (parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (cryptoType === "CNGN") {
      // CNGN to NGN: Direct offramp
      offRamp.mutate(
        {
          network: "base",
          amount: Number(parseFloat(sellAmount.replace(/,/g, "")).toFixed(6)),
          destination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response) => {
            setTransactionData(response.data);
            setStep("pending");
          },
        },
      );
    } else if (cryptoType === "USDC") {
      // USDC to NGN: Swap flow
      if (!isConnected || !address) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet to continue",
          variant: "destructive",
        });
        return;
      }

      if (!ngnEstimate?.estimatedNgn) {
        toast({
          title: "Rate calculation in progress",
          description: "Please wait for the estimated NGN value",
          variant: "destructive",
        });
        return;
      }

      const ngnAmount = Math.round(ngnEstimate.estimatedNgn);
      initializeSwap.mutate(
        {
          amount: ngnAmount,
          usdcAmount: Number(
            parseFloat(sellAmount.replace(/,/g, "")).toFixed(6),
          ),
          slippage: 0.05,
          network: "base",
          offrampDestination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response) => {
            setSwapData(response.data);
            setStep("execute");
          },
        },
      );
    }
  }, [
    isAuthenticated,
    sellAmount,
    bankCode,
    accountNumber,
    accountResolved,
    accountName,
    cryptoType,
    isConnected,
    address,
    ngnEstimate,
    setIsAuthModalOpen,
    toast,
    offRamp,
    initializeSwap,
    setTransactionData,
    setSwapData,
    setStep,
  ]);

  const handleBuy = useCallback(async () => {
    if (!isAuthenticated()) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!buyAmount || !walletAddress) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFloat(buyAmount);
    if (isNaN(parsedAmount) || parsedAmount < 100) {
      toast({
        title: "Invalid amount",
        description: "Minimum amount is 100 NGN",
        variant: "destructive",
      });
      return;
    }

    onRamp.mutate(
      {
        network: "base",
        amount: Math.round(parseFloat(buyAmount.replace(/,/g, ""))),
        destination: { address: walletAddress },
      },
      {
        onSuccess: (response) => {
          setTransactionData(response.data);
          setStep("pending");
        },
      },
    );
  }, [
    isAuthenticated,
    buyAmount,
    walletAddress,
    setIsAuthModalOpen,
    toast,
    onRamp,
    setTransactionData,
    setStep,
  ]);

  const handleSwap = useCallback(async () => {
    if (!isConnected || !address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to continue",
        variant: "destructive",
      });
      return;
    }

    if (!sellAmount) {
      toast({
        title: "Missing amount",
        description: "Please enter an amount to swap",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFormattedNumber(sellAmount);
    if (
      fromCryptoType === "CNGN" &&
      toCryptoType === "USDC" &&
      parsedAmount < 100
    ) {
      toast({
        title: "Invalid amount",
        description: "Minimum amount for CNGN to USDC swap is 100 CNGN",
        variant: "destructive",
      });
      return;
    }
    if (
      fromCryptoType === "USDC" &&
      toCryptoType === "CNGN" &&
      parsedAmount < 1
    ) {
      toast({
        title: "Invalid amount",
        description: "Minimum amount for USDC to CNGN swap is 1 USDC",
        variant: "destructive",
      });
      return;
    }
    if (parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    // Calculate exchange rate (1:1 for now, or use actual rate if available)
    const exchangeRate = 1;
    const toAmount = parsedAmount; // 1:1 swap for now

    // Prepare swap data structure similar to initializeSwap response
    // For simple swap, recipient is the user's own address
    const swapResponseData = {
      swap: {
        id: "",
        reference: "",
        fromAmount: parsedAmount,
        toAmount: toAmount,
        exchangeRate: exchangeRate,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      },
      recipientAddress: address, // User's wallet address (they receive the swapped tokens)
      swapParams: {
        tokenIn:
          fromCryptoType === "USDC" ? SWAP_CONSTANTS.USDC : SWAP_CONSTANTS.CNGN,
        tokenOut:
          toCryptoType === "USDC" ? SWAP_CONSTANTS.USDC : SWAP_CONSTANTS.CNGN,
        amountIn: parsedAmount.toString(),
        recipient: address,
        slippage: 0.05,
      },
    };

    // Store swap in database
    createSimpleSwap.mutate(
      {
        fromTokenType: fromCryptoType,
        toTokenType: toCryptoType,
        fromAmount: Number(parseFloat(sellAmount.replace(/,/g, "")).toFixed(6)),
        toAmount: Number(parseFloat(toAmount.toString()).toFixed(6)),
        exchangeRate: exchangeRate,
        sourceAddress: address,
        destinationAddress: address,
        network: "base",
      },
      {
        onSuccess: (response) => {
          // Update swap data with the response and add swapParams for execution
          setSwapData({
            swap: response.data,
            recipientAddress: address,
            swapParams: swapResponseData.swapParams,
          });
          setStep("execute");
        },
        onError: (error: any) => {
          toast({
            title: "Swap Creation Failed",
            description:
              error.response?.data?.message ||
              "Failed to create swap transaction",
            variant: "destructive",
          });
        },
      },
    );
  }, [
    isConnected,
    address,
    sellAmount,
    fromCryptoType,
    toCryptoType,
    toast,
    createSimpleSwap,
    setSwapData,
    setStep,
  ]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (activeTab === "sell") {
        handleSell();
      } else if (activeTab === "buy") {
        handleBuy();
      } else if (activeTab === "swap") {
        handleSwap();
      }
    },
    [activeTab, handleSell, handleBuy, handleSwap],
  );

  return {
    handleSell,
    handleBuy,
    handleSwap,
    handleSubmit,
    isLoading: {
      sell:
        offRamp.isPending ||
        (cryptoType === "USDC" && initializeSwap.isPending),
      buy: onRamp.isPending,
      swap: createSimpleSwap.isPending,
    },
  };
}
