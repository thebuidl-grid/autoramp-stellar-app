"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUpDown,
  CheckCircle,
  AlertCircle,
  Copy,
  Loader2,
  ArrowDown,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { formatNumber } from "@/lib/utils";
import { TabButton } from "@/components/swap/tab-button";
import { SwapSection } from "@/components/swap/swap-section";
import { CryptoSelectionModal } from "@/components/swap/crypto-selection-modal";
import { SavedAccountSelector } from "@/components/swap/SavedAccountSelector";
import { SavedWalletSelector } from "@/components/swap/SavedWalletSelector";
import { HeroBackground } from "@/components/hero/hero-background";
import {
  useBanks,
  useEstimateNgn,
  useUsdNgnRate,
  useOffRamp,
  useOnRamp,
  useInitializeSwap,
  useUpdateSwapAfterExecution,
  useSwapWebSocket,
  useCreateSimpleSwap,
  useResolveAccount,
} from "@/lib/hooks";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { parseFormattedNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { EmailOtpModal } from "@/components/auth/email-otp-modal";
import { copyToClipboard } from "@/lib/utils";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  SWAP_CONSTANTS,
  SWAP_ROUTER_ABI,
  ERC20_ABI,
} from "@/lib/constants/swap-constants";
import { parseUnits, formatUnits, encodePacked } from "viem";
import { useTransactionStore } from "@/lib/store";
import { QUOTER_ABI, QUOTER_ADDRESS } from "@/lib/constants/quoter-constants";

export default function HomePage() {
  const { toast } = useToast();
  const { data: banks = [] } = useBanks();
  const offRamp = useOffRamp();
  const onRamp = useOnRamp();
  const initializeSwap = useInitializeSwap();
  const updateSwap = useUpdateSwapAfterExecution();
  const createSimpleSwap = useCreateSimpleSwap();
  const { address, isConnected } = useAccount();

  const activeTab = useTransactionStore((state) => state.activeTab);
  const cryptoType = useTransactionStore((state) => state.cryptoType);
  const fromCryptoType = useTransactionStore((state) => state.fromCryptoType);
  const toCryptoType = useTransactionStore((state) => state.toCryptoType);
  const isCryptoModalOpen = useTransactionStore(
    (state) => state.isCryptoModalOpen,
  );
  const isFromCryptoModalOpen = useTransactionStore(
    (state) => state.isFromCryptoModalOpen,
  );
  const isToCryptoModalOpen = useTransactionStore(
    (state) => state.isToCryptoModalOpen,
  );
  const sellAmount = useTransactionStore((state) => state.sellAmount);
  const buyAmount = useTransactionStore((state) => state.buyAmount);
  const bankCode = useTransactionStore((state) => state.bankCode);
  const accountNumber = useTransactionStore((state) => state.accountNumber);
  const walletAddress = useTransactionStore((state) => state.walletAddress);
  const isAuthModalOpen = useTransactionStore((state) => state.isAuthModalOpen);
  const step = useTransactionStore((state) => state.step);
  const transactionData = useTransactionStore((state) => state.transactionData);
  const swapData = useTransactionStore((state) => state.swapData);

  const setActiveTab = useTransactionStore((state) => state.setActiveTab);
  const setCryptoType = useTransactionStore((state) => state.setCryptoType);
  const setFromCryptoType = useTransactionStore(
    (state) => state.setFromCryptoType,
  );
  const setToCryptoType = useTransactionStore((state) => state.setToCryptoType);
  const setIsCryptoModalOpen = useTransactionStore(
    (state) => state.setIsCryptoModalOpen,
  );
  const setIsFromCryptoModalOpen = useTransactionStore(
    (state) => state.setIsFromCryptoModalOpen,
  );
  const setIsToCryptoModalOpen = useTransactionStore(
    (state) => state.setIsToCryptoModalOpen,
  );
  const setSellAmount = useTransactionStore((state) => state.setSellAmount);
  const setBuyAmount = useTransactionStore((state) => state.setBuyAmount);
  const setBankCode = useTransactionStore((state) => state.setBankCode);
  const setAccountNumber = useTransactionStore(
    (state) => state.setAccountNumber,
  );
  const setWalletAddress = useTransactionStore(
    (state) => state.setWalletAddress,
  );
  const setIsAuthModalOpen = useTransactionStore(
    (state) => state.setIsAuthModalOpen,
  );
  const setStep = useTransactionStore((state) => state.setStep);
  const setTransactionData = useTransactionStore(
    (state) => state.setTransactionData,
  );
  const setSwapData = useTransactionStore((state) => state.setSwapData);
  const resetForm = useTransactionStore((state) => state.resetForm);

  // Account resolution state (not in transaction store - handled by hook)
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountResolved, setAccountResolved] = useState(false);
  const [accountResolutionError, setAccountResolutionError] = useState<
    "auth" | "invalid" | null
  >(null);
  const resolveAccount = useResolveAccount();

  // Local UI state
  const [copied, setCopied] = useState(false);
  const [isAutoSwapping, setIsAutoSwapping] = useState(false);

  const parsedSellAmount = sellAmount ? parseFormattedNumber(sellAmount) : null;
  const parsedBuyAmount = buyAmount ? parseFormattedNumber(buyAmount) : null;

  let amountToConvert: number | null = null;
  let needsConversion = false;

  if (activeTab === "sell") {
    if (cryptoType === "USDC" && parsedSellAmount && parsedSellAmount > 0) {
      amountToConvert = parsedSellAmount;
      needsConversion = true;
    }
  } else if (activeTab === "buy") {
    if (cryptoType === "USDC" && parsedBuyAmount && parsedBuyAmount > 0) {
      amountToConvert = parsedBuyAmount;
      needsConversion = true;
    }
  } else if (activeTab === "swap") {
    if (fromCryptoType === "USDC" && parsedSellAmount && parsedSellAmount > 0) {
      amountToConvert = parsedSellAmount;
      needsConversion = true;
    }
  }

  const {
    data: ngnEstimate,
    isLoading: isLoadingEstimate,
    error: ngnEstimateError,
  } = useEstimateNgn(needsConversion ? amountToConvert : null);
  const { data: usdNgnRate } = useUsdNgnRate();

  // Handle 401 errors for NGN estimate endpoint
  useEffect(() => {
    if (
      ngnEstimateError &&
      (ngnEstimateError as any)?.response?.status === 401
    ) {
      setIsAuthModalOpen(true);
    }
  }, [ngnEstimateError, setIsAuthModalOpen]);

  // WebSocket for transaction updates
  const handleWebSocketUpdate = useCallback(
    (update: any) => {
      console.log("WebSocket update received:", update);
      if (update.status === "COMPLETED") {
        setStep("completed");
        toast({
          title: "Transaction Completed",
          description: "Your transaction has been completed successfully!",
          variant: "success",
        });
      }
    },
    [toast],
  );

  const reference =
    transactionData?.databaseRecord?.reference ||
    transactionData?.data?.reference ||
    swapData?.swap?.reference;
  // Only use WebSocket for buy and sell tabs (not swap tab)
  const { isConnected: wsConnected } = useSwapWebSocket({
    reference,
    token:
      typeof window !== "undefined"
        ? localStorage.getItem("token") || undefined
        : undefined,
    enabled: !!reference && step === "pending" && activeTab !== "swap",
    onUpdate: handleWebSocketUpdate,
  });

  const { data: cngnBalance } = useReadContract({
    address: SWAP_CONSTANTS.CNGN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address && isConnected,
    },
  });

  const { data: usdcBalance } = useReadContract({
    address: SWAP_CONSTANTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled:
        !!address &&
        isConnected &&
        (activeTab === "sell" || activeTab === "swap"),
    },
  });

  const { data: usdtBalance } = useReadContract({
    address: SWAP_CONSTANTS.USDT as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled:
        !!address &&
        isConnected &&
        (activeTab === "sell" || activeTab === "swap"),
    },
  });

  // Swap execution (for USDC to NGN sell and swap tab)
  // Determine which token to check allowance for based on swap data
  const tokenAddressForAllowance = swapData?.swapParams?.tokenIn
    ? swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase()
      ? SWAP_CONSTANTS.USDC
      : SWAP_CONSTANTS.CNGN
    : SWAP_CONSTANTS.USDC; // Default to USDC

  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: isCheckingAllowance,
  } = useReadContract({
    address: tokenAddressForAllowance as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args:
      address && SWAP_CONSTANTS.SWAP_ROUTER
        ? ([
            address as `0x${string}`,
            SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`,
          ] as const)
        : undefined,
    query: {
      enabled:
        !!address &&
        !!SWAP_CONSTANTS.SWAP_ROUTER &&
        step === "execute" &&
        !!swapData,
    },
  });

  const {
    writeContract: approveToken,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: isWaitingApproval, isSuccess: isApproved } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: executeSwap,
    data: swapHash,
    isPending: isExecuting,
  } = useWriteContract();
  const { isLoading: isWaitingSwap, isSuccess: isSwapSuccess } =
    useWaitForTransactionReceipt({ hash: swapHash });

  const hasUpdatedSwap = useRef(false);
  useEffect(() => {
    if (
      isSwapSuccess &&
      swapHash &&
      swapData &&
      address &&
      !hasUpdatedSwap.current &&
      step === "execute"
    ) {
      hasUpdatedSwap.current = true;
      updateSwap.mutate(
        {
          reference: swapData.swap.reference,
          data: { transactionHash: swapHash, sourceAddress: address },
        },
        {
          onSuccess: () => {
            if (activeTab === "swap") {
              setStep("completed");
              toast({
                title: "Swap Completed",
                description:
                  "Your swap transaction has been completed successfully!",
                variant: "default",
              });
            } else {
              setStep("pending");
            }
          },
          onError: () => {
            hasUpdatedSwap.current = false;
          },
        },
      );
    }
  }, [
    isSwapSuccess,
    swapHash,
    swapData,
    address,
    step,
    updateSwap,
    activeTab,
    toast,
  ]);

  useEffect(() => {
    hasUpdatedSwap.current = false;
  }, [swapHash]);

  useEffect(() => {
    if (isApproved) refetchAllowance();
  }, [isApproved, refetchAllowance]);

  // Daisy-chain: Automatically trigger swap after approval is confirmed
  useEffect(() => {
    if (isApproved && isAutoSwapping) {
      console.log("Approval confirmed, auto-triggering swap...");
      handleExecuteSwap();
      setIsAutoSwapping(false);
    }
  }, [isApproved, isAutoSwapping]);

  const tabs = [
    { id: "buy" as const, label: "Buy" },
    { id: "sell" as const, label: "Sell" },
    { id: "swap" as const, label: "Swap" },
  ];

  const handleSellAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") {
      setSellAmount("");
      return;
    }
    const formatted = formatNumber(value);
    setSellAmount(formatted);
  };

  const handleBuyAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") {
      setBuyAmount("");
      return;
    }
    const formatted = formatNumber(value);
    console.log(formatted, "formatted ");
    console.log(parseFloat(buyAmount).toLocaleString(), "style form");
    setBuyAmount(formatted);
  };

  const handleCryptoSelect = (type: "CNGN" | "USDC" | "USDT") => {
    setCryptoType(type);
    setIsCryptoModalOpen(false);
  };

  const handleFromCryptoSelect = (type: "CNGN" | "USDC" | "USDT") => {
    setFromCryptoType(type);
    setIsFromCryptoModalOpen(false);
    if (type === toCryptoType) {
      if (type === "CNGN") {
        setToCryptoType("USDC"); // Default to USDC if CNGN selected
      } else {
        setToCryptoType("CNGN"); // Default to CNGN
      }
    }
  };

  const handleToCryptoSelect = (type: "CNGN" | "USDC" | "USDT") => {
    setToCryptoType(type);
    setIsToCryptoModalOpen(false);
    if (type === fromCryptoType) {
      if (type === "CNGN") {
        setFromCryptoType("USDC");
      } else {
        setFromCryptoType("CNGN");
      }
    }
  };

  const isAuthenticated = () => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("token");
  };

  // Wrapper to reset form and account resolution state
  const handleResetForm = () => {
    resetForm(); // Reset transaction store state
    setAccountName(null);
    setAccountResolved(false);
  };

  const lastResolvedRef = useRef<{
    bankCode: string;
    accountNumber: string;
  } | null>(null);
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
        setAccountResolutionError(null);
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

    // Debounce the resolution request by 500ms to prevent rapid-fire requests
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
                  setAccountResolutionError(null);
                } else {
                  setAccountName(null);
                  setAccountResolved(false);
                  setAccountResolutionError("invalid");
                  lastResolvedRef.current = null;
                }
              },
              onError: (error: any) => {
                setAccountName(null);
                setAccountResolved(false);
                // Check if error is 401 (authentication required)
                if (error?.response?.status === 401) {
                  setAccountResolutionError("auth");
                  setIsAuthModalOpen(true);
                } else {
                  setAccountResolutionError("invalid");
                }
                // Reset ref on error so we can retry if user changes and types again
                lastResolvedRef.current = null;
              },
            },
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
  }, [accountNumber, bankCode, activeTab, resolveAccount.mutate]);

  // 1. Determine if we need a quote
  const isSwapMode = activeTab === "swap";
  const isSellQuoteMode =
    activeTab === "sell" && (cryptoType === "USDC" || cryptoType === "USDT");
  const shouldFetchQuote = (isSwapMode || isSellQuoteMode) && !!sellAmount;

  // 2. Determine Tokens for the Quote
  let quoteTokenIn: string | undefined;
  let quoteTokenOut: string | undefined;
  let quoteDecimalsIn = 18; // Default
  let quoteDecimalsOut = 18; // Default

  // Helper to resolve token address
  const getTokenAddress = (type: string) => {
    if (type === "USDC") return SWAP_CONSTANTS.USDC;
    if (type === "USDT") return SWAP_CONSTANTS.USDT;
    return SWAP_CONSTANTS.CNGN;
  };

  const getTokenDecimals = (type: string) => {
    if (type === "USDC") return SWAP_CONSTANTS.USDC_DECIMALS;
    if (type === "USDT") return SWAP_CONSTANTS.USDT_DECIMALS;
    return SWAP_CONSTANTS.CNGN_DECIMALS;
  };

  if (isSwapMode) {
    quoteTokenIn = getTokenAddress(fromCryptoType);
    quoteTokenOut = getTokenAddress(toCryptoType);
    quoteDecimalsIn = getTokenDecimals(fromCryptoType);
    quoteDecimalsOut = getTokenDecimals(toCryptoType);
  } else if (isSellQuoteMode) {
    // Sell Mode: USDC -> CNGN or USDT -> CNGN
    quoteTokenIn = getTokenAddress(cryptoType);
    quoteTokenOut = SWAP_CONSTANTS.CNGN;
    quoteDecimalsIn = getTokenDecimals(cryptoType);
    quoteDecimalsOut = SWAP_CONSTANTS.CNGN_DECIMALS;
  }

  // Determine if we need a multi-hop swap (USDT <-> CNGN)
  // Logic: If USDT is involved with CNGN, we route through USDC
  // Path: USDT -> USDC -> CNGN (fee 100 for stable, 500 for usdc-cngn)
  // V3 Fee tiers: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%)
  const isMultiHop =
    (quoteTokenIn === SWAP_CONSTANTS.USDT &&
      quoteTokenOut === SWAP_CONSTANTS.CNGN) ||
    (quoteTokenIn === SWAP_CONSTANTS.CNGN &&
      quoteTokenOut === SWAP_CONSTANTS.USDT);

  // Helper for swap path (Unified)
  const getSwapPath = (tokenIn: string, tokenOut: string) => {
    const isUSDT = tokenIn.toLowerCase() === SWAP_CONSTANTS.USDT.toLowerCase();
    const isUSDC = tokenIn.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase();
    const isCNGN = tokenIn.toLowerCase() === SWAP_CONSTANTS.CNGN.toLowerCase();

    const outUSDT =
      tokenOut.toLowerCase() === SWAP_CONSTANTS.USDT.toLowerCase();
    const outUSDC =
      tokenOut.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase();
    const outCNGN =
      tokenOut.toLowerCase() === SWAP_CONSTANTS.CNGN.toLowerCase();

    // Multi-Hop: USDT -> USDC -> CNGN
    if (isUSDT && outCNGN) {
      return encodePacked(
        ["address", "int24", "address", "int24", "address"],
        [
          SWAP_CONSTANTS.USDT as `0x${string}`,
          1, // tickSpacing 1
          SWAP_CONSTANTS.USDC as `0x${string}`,
          10, // tickSpacing 10
          SWAP_CONSTANTS.CNGN as `0x${string}`,
        ],
      );
    }
    // Multi-Hop: CNGN -> USDC -> USDT
    if (isCNGN && outUSDT) {
      return encodePacked(
        ["address", "int24", "address", "int24", "address"],
        [
          SWAP_CONSTANTS.CNGN as `0x${string}`,
          10,
          SWAP_CONSTANTS.USDC as `0x${string}`,
          1,
          SWAP_CONSTANTS.USDT as `0x${string}`,
        ],
      );
    }

    // Direct: USDC -> USDT (Stable)
    if (isUSDC && outUSDT) {
      return encodePacked(
        ["address", "int24", "address"],
        [
          SWAP_CONSTANTS.USDC as `0x${string}`,
          1,
          SWAP_CONSTANTS.USDT as `0x${string}`,
        ],
      );
    }
    // Direct: USDT -> USDC (Stable)
    if (isUSDT && outUSDC) {
      return encodePacked(
        ["address", "int24", "address"],
        [
          SWAP_CONSTANTS.USDT as `0x${string}`,
          1,
          SWAP_CONSTANTS.USDC as `0x${string}`,
        ],
      );
    }

    // Direct: USDC -> CNGN (Normal)
    if (isUSDC && outCNGN) {
      return encodePacked(
        ["address", "int24", "address"],
        [
          SWAP_CONSTANTS.USDC as `0x${string}`,
          10,
          SWAP_CONSTANTS.CNGN as `0x${string}`,
        ],
      );
    }
    // Direct: CNGN -> USDC (Normal)
    if (isCNGN && outUSDC) {
      return encodePacked(
        ["address", "int24", "address"],
        [
          SWAP_CONSTANTS.CNGN as `0x${string}`,
          10,
          SWAP_CONSTANTS.USDC as `0x${string}`,
        ],
      );
    }

    return undefined;
  };

  // Construct path (Unified)
  let swapPath: `0x${string}` | undefined;

  if (shouldFetchQuote && quoteTokenIn && quoteTokenOut) {
    swapPath = getSwapPath(quoteTokenIn, quoteTokenOut);
  }

  // 3. Parse the amount
  const parsedQuoteAmount = sellAmount
    ? parseUnits(parseFormattedNumber(sellAmount).toString(), quoteDecimalsIn)
    : 0n;

  // 4. Update the Hook (Unified Quote Fetching)
  const { data: quoteResult, isLoading: isQuoteLoading } = useReadContract({
    address: QUOTER_ADDRESS,
    abi: QUOTER_ABI,
    functionName: "quoteExactInput",
    args:
      swapPath && parsedQuoteAmount > 0n
        ? [swapPath, parsedQuoteAmount]
        : undefined,
    query: {
      enabled: shouldFetchQuote && parsedQuoteAmount > 0n && !!swapPath,
      staleTime: 10_000,
    },
  });

  // 5. Extract Result
  // Cast strictly to tuple [amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate]
  const quoteAmountOut = quoteResult
    ? (quoteResult as [bigint, bigint[], number[], bigint])[0]
    : 0n;

  // Helper to calculate rate from raw contract data
  const calculateExchangeRate = (
    amountIn: number,
    amountOutBigInt: bigint,
    decimalsOut: number,
  ) => {
    if (amountIn <= 0 || amountOutBigInt === 0n) {
      return { toAmount: 0, exchangeRate: 0 };
    }

    // Format the BigInt result to a number (e.g., 5000000n -> 5.0)
    const formattedQuote = formatUnits(amountOutBigInt, decimalsOut);
    const toAmount = parseFloat(formattedQuote);

    // Calculate rate: Output / Input
    const exchangeRate = toAmount / amountIn;

    return { toAmount, exchangeRate };
  };

  // Handle sell: CNGN to NGN (offramp) or USDC to NGN (swap)
  const handleSell = async () => {
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

    if (parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (cryptoType === "CNGN") {
      if (parsedAmount < 100) {
        toast({
          title: "Invalid amount",
          description: "Minimum amount for CNGN is 100",
          variant: "destructive",
        });
        return;
      }

      const amountToSend = Math.round(parsedAmount);
      offRamp.mutate(
        {
          network: "base",
          amount: amountToSend,
          destination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response) => {
            setTransactionData(response.data);
            setStep("pending");
          },
        },
      );
    } else if (cryptoType === "USDC" || cryptoType === "USDT") {
      if (!isConnected || !address) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet to continue",
          variant: "destructive",
        });
        return;
      }

      if (!quoteAmountOut || quoteAmountOut === 0n) {
        toast({
          title: "Quote not ready",
          description: "Please wait for the exchange rate to load.",
          variant: "destructive",
        });
        return;
      }

      const projectedNgnAmount = parseFloat(
        formatUnits(quoteAmountOut, SWAP_CONSTANTS.CNGN_DECIMALS),
      );

      console.log(projectedNgnAmount, "projected");

      if (projectedNgnAmount < 100) {
        toast({
          title: "Amount too low",
          description: `Minimum withdrawal is 100 NGN. Estimated output: ${projectedNgnAmount.toFixed(
            2,
          )} NGN`,
          variant: "destructive",
        });
        return;
      }

      // Re-using initializeSwap which currently expects usdcAmount.
      // We will pass the amount as usdcAmount even if it is USDT, assuming backend logic or just variable reuse.
      initializeSwap.mutate(
        {
          amount: projectedNgnAmount,
          usdcAmount: parsedAmount,
          slippage: 0.05,
          network: "base",
          offrampDestination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response) => {
            console.log(response, "response from init");
            // FORCE override tokenIn if it's USDT, because backend might return USDC by default?
            // Safe bet: Update the local state with correct tokenIn if we know it.
            const updatedResponse = { ...response.data };
            if (cryptoType === "USDT") {
              if (updatedResponse.swapParams) {
                updatedResponse.swapParams.tokenIn = SWAP_CONSTANTS.USDT;
              }
            }
            setSwapData(updatedResponse);
            setStep("execute");
          },
        },
      );
    }
  };

  // Handle buy: NGN to CNGN (onramp)
  const handleBuy = async () => {
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

    // const parsedAmount = parseFloat(buyAmount);
    // if (isNaN(parsedAmount) || parsedAmount < 100) {
    //   toast({
    //     title: "Invalid amount",
    //     description: "Minimum amount is 100 NGN",
    //     variant: "destructive",
    //   });
    //   return;
    // }
    const sanitizedAmount = buyAmount.replace(/[^0-9.]/g, ""); // removes commas, currency symbols, spaces
    const parsedAmount = parseFloat(sanitizedAmount);
    console.log(parsedAmount, "santi amount");

    if (!Number.isFinite(parsedAmount) || parsedAmount < 100) {
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
        amount: parsedAmount,
        destination: { address: walletAddress },
      },
      {
        onSuccess: (response) => {
          setTransactionData(response.data);
          setStep("pending");
        },
      },
    );
  };

  // Handle swap execution
  const handleApprove = async () => {
    if (!swapData || !address) return;
    try {
      // 1. Setup Tokens
      const tokenInAddress = swapData.swapParams.tokenIn;

      const isUSDC =
        tokenInAddress.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase();
      const isUSDT =
        tokenInAddress.toLowerCase() === SWAP_CONSTANTS.USDT.toLowerCase();

      const tokenAddress = isUSDC
        ? SWAP_CONSTANTS.USDC
        : isUSDT
          ? SWAP_CONSTANTS.USDT
          : SWAP_CONSTANTS.CNGN;

      const decimals = isUSDC
        ? SWAP_CONSTANTS.USDC_DECIMALS
        : isUSDT
          ? SWAP_CONSTANTS.USDT_DECIMALS
          : SWAP_CONSTANTS.CNGN_DECIMALS;

      // 2. Parse Amount Safely
      // DIRECTLY use the string from the DB/State. Do not convert to number first.
      const rawAmountString = swapData.swapParams.amountIn;
      const tokenAmount = parseUnits(rawAmountString, decimals);

      console.log(
        `Approving ${rawAmountString} (${tokenAmount}) for ${tokenAddress}`,
      );

      approveToken({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`, tokenAmount],
      });
    } catch (error: any) {
      console.error("Approval logic error:", error);
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to prepare approval",
        variant: "destructive",
      });
    }
  };

  const handleExecuteSwap = async () => {
    if (!address || !swapData || !SWAP_CONSTANTS.SWAP_ROUTER) return;

    // 1. Setup Tokens
    const isTokenInUSDC =
      swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase();
    const isTokenInUSDT =
      swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDT.toLowerCase();

    const isTokenOutUSDC =
      swapData.swapParams.tokenOut.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase();
    const isTokenOutUSDT =
      swapData.swapParams.tokenOut.toLowerCase() ===
      SWAP_CONSTANTS.USDT.toLowerCase();

    const tokenInDecimals = isTokenInUSDC
      ? SWAP_CONSTANTS.USDC_DECIMALS
      : isTokenInUSDT
        ? SWAP_CONSTANTS.USDT_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;

    const tokenOutDecimals = isTokenOutUSDC
      ? SWAP_CONSTANTS.USDC_DECIMALS
      : isTokenOutUSDT
        ? SWAP_CONSTANTS.USDT_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;

    // 2. Parse Inputs
    // We re-parse amountIn to ensure it matches the decimals exactly
    const amountIn = parseUnits(swapData.swapParams.amountIn, tokenInDecimals);
    const slippage = swapData.swapParams.slippage || 0.05; // 5%

    // 3. Calculate Minimum Output (Slippage Protection)
    // TRUST THE DB: We saved the exact quote in handleSwap, so use it.
    const expectedOutput = Number(swapData.swap.toAmount);

    // Calculate min amount: expected * (1 - slippage)
    // e.g., 100 * 0.95 = 95
    const minAmount = expectedOutput * (1 - slippage);

    // Safety check: Ensure we don't pass 0 or negative
    const safeMinAmount = Math.max(minAmount, 0);

    // Convert to BigInt for the contract
    // We use toFixed to avoid scientific notation bugs (e.g. 1e-7)
    const amountOutMinimum = parseUnits(
      safeMinAmount.toFixed(tokenOutDecimals),
      tokenOutDecimals,
    );

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120); // 2 mins

    // Get Path (Unified)
    const swapPath = getSwapPath(
      swapData.swapParams.tokenIn,
      swapData.swapParams.tokenOut,
    );

    try {
      console.log("Executing Swap with params:", {
        tokenIn: swapData.swapParams.tokenIn,
        tokenOut: swapData.swapParams.tokenOut,
        path: swapPath,
        amountIn: amountIn.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        expectedOutput: expectedOutput,
      });

      if (swapPath) {
        // Execute Swap (Unified - exactInput)
        executeSwap({
          address: SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`,
          abi: SWAP_ROUTER_ABI,
          functionName: "exactInput",
          args: [
            {
              path: swapPath,
              recipient: swapData.swapParams.recipient as `0x${string}`,
              deadline,
              amountIn,
              amountOutMinimum,
            },
          ],
        });
      } else {
        console.error("Invalid swap path");
        toast({
          title: "Swap Failed",
          description: "Could not determine swap path",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Swap execution error:", error);
      toast({
        title: "Swap Failed",
        description: error.message || "Failed to execute swap",
        variant: "destructive",
      });
    }
  };

  // Handle swap: USDC ↔ CNGN (simple swap, no offramp)
  const handleSwap = async () => {
    // 1. Validation
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

    // Amount Limits - Generic check?
    // CNGN minimums
    if (fromCryptoType === "CNGN" && parsedAmount < 100) {
      toast({
        title: "Invalid amount",
        description: "Minimum amount is 100 CNGN",
        variant: "destructive",
      });
      return;
    }

    // For USDC/USDT to CNGN, check estimated output
    if (toCryptoType === "CNGN") {
      // Calculate estimated CNGN amount from quote
      const estimatedCngn = quoteAmountOut
        ? parseFloat(formatUnits(quoteAmountOut, SWAP_CONSTANTS.CNGN_DECIMALS))
        : 0;

      // Minimum 100 CNGN equivalent
      if (estimatedCngn < 100) {
        toast({
          title: "Amount too low",
          description: `Minimum amount is 100 CNGN equivalent`,
          variant: "destructive",
        });
        return;
      }
    }

    if (parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    // Quote Check
    if (!quoteAmountOut || quoteAmountOut === 0n) {
      toast({
        title: "Quote not ready",
        description:
          "Please wait for the exchange rate to load from the blockchain.",
        variant: "destructive",
      });
      return;
    }

    // 2. Preparation
    const isToUSDC = toCryptoType === "USDC";
    const isToUSDT = toCryptoType === "USDT";
    const tokenOutDecimals = isToUSDC
      ? SWAP_CONSTANTS.USDC_DECIMALS
      : isToUSDT
        ? SWAP_CONSTANTS.USDT_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;

    const { toAmount, exchangeRate } = calculateExchangeRate(
      parsedAmount,
      quoteAmountOut,
      tokenOutDecimals,
    );

    const getTokenAddress = (type: string) => {
      if (type === "USDC") return SWAP_CONSTANTS.USDC;
      if (type === "USDT") return SWAP_CONSTANTS.USDT;
      return SWAP_CONSTANTS.CNGN;
    };

    const swapResponseData = {
      swap: {
        id: "",
        reference: "",
        fromAmount: parsedAmount,
        toAmount: quoteAmountOut,
        exchangeRate,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      },
      recipientAddress: address,
      swapParams: {
        tokenIn: getTokenAddress(fromCryptoType),
        tokenOut: getTokenAddress(toCryptoType),
        amountIn: parsedAmount.toString(),
        recipient: address,
        slippage: 0.05,
      },
    };

    // 3. Execution
    createSimpleSwap.mutate(
      {
        fromTokenType: fromCryptoType,
        toTokenType: toCryptoType,
        fromAmount: parsedAmount,
        toAmount,
        exchangeRate,
        sourceAddress: address,
        destinationAddress: address,
        network: "base",
      },
      {
        onSuccess: (response) => {
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === "sell") {
      handleSell();
    } else if (activeTab === "buy") {
      handleBuy();
    } else if (activeTab === "swap") {
      handleSwap();
    }
  };

  // Determine if approval is needed based on the input token
  const needsApproval =
    swapData &&
    allowance !== undefined &&
    (() => {
      const parsedAmount = parseFloat(swapData.swapParams.amountIn);
      const isUSDC =
        swapData.swapParams.tokenIn.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const isUSDT =
        swapData.swapParams.tokenIn.toLowerCase() ===
        SWAP_CONSTANTS.USDT.toLowerCase();

      const decimals = isUSDC
        ? SWAP_CONSTANTS.USDC_DECIMALS
        : isUSDT
          ? SWAP_CONSTANTS.USDT_DECIMALS
          : SWAP_CONSTANTS.CNGN_DECIMALS;

      const amountIn = parseUnits(parsedAmount.toString(), decimals);
      return amountIn > allowance;
    })();

  // Helper to handle percentage clicks
  // We need to format the raw number (e.g. 1000.5) back to your input format (e.g. "1,000.5")
  const handlePercentageClick = (rawValue: string) => {
    // 1. Convert to number string with commas using your existing util
    const formatted = formatNumber(rawValue);

    // 2. Set the appropriate store value
    if (activeTab === "buy") {
      setBuyAmount(formatted);
    } else {
      setSellAmount(formatted);
    }
  };

  // Helper to get the currently relevant balance
  let activeBalance: number | undefined = undefined;

  if (activeTab === "sell") {
    if (cryptoType === "USDC" && usdcBalance !== undefined) {
      activeBalance = parseFloat(
        formatUnits(usdcBalance, SWAP_CONSTANTS.USDC_DECIMALS),
      );
    } else if (cryptoType === "CNGN" && cngnBalance !== undefined) {
      activeBalance = parseFloat(
        formatUnits(cngnBalance, SWAP_CONSTANTS.CNGN_DECIMALS),
      );
    } else if (cryptoType === "USDT" && usdtBalance !== undefined) {
      activeBalance = parseFloat(
        formatUnits(usdtBalance, SWAP_CONSTANTS.USDT_DECIMALS),
      );
    }
  } else if (activeTab === "swap") {
    if (fromCryptoType === "USDC" && usdcBalance !== undefined) {
      activeBalance = parseFloat(
        formatUnits(usdcBalance, SWAP_CONSTANTS.USDC_DECIMALS),
      );
    } else if (fromCryptoType === "CNGN" && cngnBalance !== undefined) {
      activeBalance = parseFloat(
        formatUnits(cngnBalance, SWAP_CONSTANTS.CNGN_DECIMALS),
      );
    } else if (fromCryptoType === "USDT" && usdtBalance !== undefined) {
      activeBalance = parseFloat(
        formatUnits(usdtBalance, SWAP_CONSTANTS.USDT_DECIMALS),
      );
    }
  }

  // Render based on step
  const renderContent = () => {
    if (step === "form") {
      return (
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-4 lg:p-6 space-y-4"
        >
          <div className="flex gap-2 mb-6">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                label={tab.label}
                isActive={activeTab === tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  handleResetForm();
                }}
              />
            ))}
          </div>

          <SwapSection
            label="You'll send"
            amount={
              activeTab === "buy"
                ? buyAmount
                : activeTab === "swap"
                  ? sellAmount
                  : sellAmount
            }
            onAmountChange={
              activeTab === "buy"
                ? handleBuyAmountChange
                : handleSellAmountChange
            }
            currencyType={
              activeTab === "buy"
                ? "NGN"
                : activeTab === "swap"
                  ? (fromCryptoType as "CNGN" | "USDC")
                  : (cryptoType as "CNGN" | "USDC" | "USDT")
            }
            onCurrencyClick={
              activeTab === "buy"
                ? undefined
                : activeTab === "swap"
                  ? () => setIsFromCryptoModalOpen(true)
                  : () => setIsCryptoModalOpen(true)
            }
            userBalance={activeBalance}
            onPercentageClick={handlePercentageClick}
          />

          <div className="flex justify-center -my-6">
            <button
              type="button"
              className="w-12 h-12 rounded-full bg-secondary hover:bg-secondary/90 flex items-center justify-center transition-colors shadow-lg"
              onClick={
                activeTab === "swap"
                  ? () => {
                      const temp = fromCryptoType;
                      setFromCryptoType(toCryptoType);
                      setToCryptoType(temp);
                    }
                  : undefined
              }
            >
              {activeTab === "buy" || activeTab === "sell" ? (
                <ArrowDown size={18} className="text-black" />
              ) : (
                <ArrowUpDown size={18} className="text-black" />
              )}
            </button>
          </div>

          <SwapSection
            label="You'll receive"
            amount={
              activeTab === "buy"
                ? (() => {
                    if (!buyAmount) return "";
                    const parsed = parseFormattedNumber(buyAmount);
                    return parsed.toLocaleString("en-NG");
                  })()
                : activeTab === "swap" ||
                    (activeTab === "sell" && cryptoType === "USDC")
                  ? (() => {
                      // --- SHARED LOGIC FOR SWAP AND SELL (USDC) ---
                      if (!sellAmount) return "";

                      if (isQuoteLoading) return "..."; // Optional: Show loading state

                      if (quoteAmountOut > 0n) {
                        // Use the decimals determined in Step 1
                        const formatted = formatUnits(
                          quoteAmountOut,
                          quoteDecimalsOut,
                        );

                        // For Sell tab (CNGN/NGN), we usually want 0 decimals (NGN is fiat-like here)
                        // For Swap tab (USDC/CNGN), we might want decimals.
                        // Adjust formatting based on context if needed.

                        return parseFloat(formatted).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                      }
                      return "0.00";
                      // ---------------------------------------------
                    })()
                  : (() => {
                      // --- LOGIC FOR SELL (CNGN ONLY) ---
                      // CNGN to NGN is 1:1, no swap needed
                      if (!sellAmount) return "";
                      const parsed = parseFormattedNumber(sellAmount);
                      return parsed.toLocaleString("en-NG");
                    })()
            }
            onAmountChange={() => {}}
            currencyType={
              activeTab === "buy"
                ? "CNGN"
                : activeTab === "swap"
                  ? (toCryptoType as "CNGN" | "USDC" | "USDT")
                  : "NGN"
            }
            onCurrencyClick={
              activeTab === "swap"
                ? () => setIsToCryptoModalOpen(true)
                : undefined
            }
            disabled={true}
            isLoading={
              (needsConversion && isLoadingEstimate) ||
              (activeTab === "swap" && isQuoteLoading)
            }
          />

          {activeTab === "buy" && (
            <div className="space-y-4">
              <SavedWalletSelector
                onSelect={(address) => setWalletAddress(address)}
              />
              <div className="space-y-2">
                <label className="text-sm text-white/70 mb-3 block">
                  Wallet Address
                </label>
                <Input
                  type="text"
                  placeholder="0x..."
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="h-14 bg-black/50! border-white/10 text-white placeholder:text-white/30 border-0! outline-0!  focus:ring-0 focus:outline-0 focus:border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          )}

          {activeTab === "sell" && (
            <div className="space-y-4">
              <SavedAccountSelector
                onSelect={(account) => {
                  setBankCode(account.bankCode);
                  setAccountNumber(account.accountNumber);
                }}
              />
              <div className="grid grid-cols-6 gap-2 p-2 bg-black/50 rounded-xl border border-white/10">
                <div className="col-span-6 md:col-span-3">
                  <SearchableBankSelect
                    banks={banks}
                    value={bankCode}
                    onValueChange={setBankCode}
                    placeholder="Choose bank"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Input
                    type="number"
                    placeholder="Enter account number"
                    value={accountNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "");
                      if (value.length <= 10) {
                        setAccountNumber(value);
                      }
                    }}
                    maxLength={10}
                    className="w-full h-14 rounded-lg bg-white/5 text-white placeholder:text-white/30 border-0 outline-0 focus:ring-0 focus:outline-0 focus:border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* Account Resolution Status */}
              {accountNumber.length === 10 && bankCode && (
                <div className="px-2">
                  {resolveAccount.isPending ? (
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Resolving account...</span>
                    </div>
                  ) : accountResolved && accountName ? (
                    <div className="flex items-center gap-2 text-sm text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <span>Account Name: {accountName}</span>
                    </div>
                  ) : accountNumber.length === 10 &&
                    !resolveAccount.isPending &&
                    accountResolutionError ? (
                    <div className="flex items-center gap-2 text-sm text-yellow-400">
                      <AlertCircle className="w-4 h-4" />
                      <span>
                        {accountResolutionError === "auth"
                          ? "Please login to resolve account"
                          : "Invalid account number"}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {activeTab === "sell" || activeTab === "swap" ? (
            <div className="p-4 rounded-xl bg-black/50 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/70">Wallet Connection</span>
                <ConnectButton showBalance={false} />
              </div>
              {isConnected &&
                usdcBalance !== undefined &&
                cngnBalance !== undefined && (
                  <>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-white/50">
                        USDC Balance
                      </span>
                      <span className="text-sm font-medium text-white">
                        {parseFloat(
                          formatUnits(
                            usdcBalance,
                            SWAP_CONSTANTS.USDC_DECIMALS,
                          ),
                        ).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}{" "}
                        USDC
                      </span>
                    </div>
                    {usdtBalance !== undefined && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-white/50">
                          USDT Balance
                        </span>
                        <span className="text-sm font-medium text-white">
                          {parseFloat(
                            formatUnits(
                              usdtBalance,
                              SWAP_CONSTANTS.USDT_DECIMALS,
                            ),
                          ).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          })}{" "}
                          USDT
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-white/50">
                        CNGN Balance
                      </span>
                      <span className="text-sm font-medium text-white">
                        {parseFloat(
                          formatUnits(
                            cngnBalance,
                            SWAP_CONSTANTS.CNGN_DECIMALS,
                          ),
                        ).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}{" "}
                        CNGN
                      </span>
                    </div>
                  </>
                )}
              {!isConnected && (
                <p className="text-xs text-white/50 mt-2">
                  Connect your wallet to continue
                </p>
              )}
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full h-14 text-sm md:font-medium rounded-xl bg-secondary hover:bg-secondary/90 text-black"
            disabled={
              activeTab === "sell" &&
              (!accountResolved || !accountName || resolveAccount.isPending)
            }
            isLoading={
              (activeTab === "sell" && offRamp.isPending) ||
              (activeTab === "sell" &&
                cryptoType === "USDC" &&
                initializeSwap.isPending) ||
              (activeTab === "buy" && onRamp.isPending) ||
              (activeTab === "swap" && createSimpleSwap.isPending)
            }
          >
            {activeTab === "buy"
              ? "BUY"
              : activeTab === "sell"
                ? "SELL"
                : "SWAP"}
          </Button>
        </form>
      );
    }

    if (step === "execute" && swapData) {
      const handleUnifiedSwap = () => {
        if (needsApproval && !isApproved) {
          // Start the chain: Approve -> Wait -> Auto-Swap
          setIsAutoSwapping(true);
          handleApprove();
        } else {
          // Direct Swap (Already approved)
          handleExecuteSwap();
        }
      };
      // 1. EXTRACT DATA FROM THE SNAPSHOT
      // We rely strictly on swapData because this is the transaction
      // the user clicked to create. We do NOT use live hooks here.
      const fromAmount = Number(swapData.swap.fromAmount);
      const toAmount = Number(swapData.swap.toAmount);
      const exchangeRate = swapData.swap.exchangeRate;

      // 2. IDENTIFY TOKENS
      const isFromUSDC =
        swapData.swapParams?.tokenIn?.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const isFromUSDT =
        swapData.swapParams?.tokenIn?.toLowerCase() ===
        SWAP_CONSTANTS.USDT.toLowerCase();

      const isToUSDC =
        swapData.swapParams?.tokenOut?.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const isToUSDT =
        swapData.swapParams?.tokenOut?.toLowerCase() ===
        SWAP_CONSTANTS.USDT.toLowerCase();

      const fromToken = isFromUSDC ? "USDC" : isFromUSDT ? "USDT" : "CNGN";
      const toToken = isToUSDC ? "USDC" : isToUSDT ? "USDT" : "CNGN";

      // 3. DETERMINE DISPLAY CONTEXT
      // If we are in the "Sell" tab (USDC -> CNGN), the user expects to see "NGN"
      // If we are in the "Swap" tab, the user expects to see the Token Name
      const isSellFlow = activeTab === "sell";
      const displayCurrency = isSellFlow ? "NGN" : toToken;

      // 4. PREPARE EXCHANGE RATE LABEL
      let exchangeRateDisplay: React.ReactNode = null;

      if (exchangeRate) {
        // If selling, we show e.g. "1 USDC = 1600 NGN"
        // If swapping, we show e.g. "1 CNGN = 0.0006 USDC"
        const targetCurrencyLabel = isSellFlow ? "NGN" : toToken;

        exchangeRateDisplay = (
          <div className="flex justify-between">
            <span className="text-white/70">Exchange Rate</span>
            <span className="text-white font-bold">
              1 {fromToken} ={" "}
              {exchangeRate.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6,
              })}{" "}
              {targetCurrencyLabel}
            </span>
          </div>
        );
      }

      const tokenToApprove = fromToken;

      return (
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-4 lg:p-6 space-y-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Execute Swap</h2>
            <p className="text-white/50">Complete your swap transaction</p>
          </div>

          <div className="space-y-4 p-4 bg-black/50 rounded-xl">
            {/* FROM SECTION */}
            <div className="flex justify-between">
              <span className="text-white/70">From</span>
              <span className="text-white font-bold">
                {fromAmount.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 6,
                })}{" "}
                {fromToken}
              </span>
            </div>

            {/* TO SECTION (Use stored toAmount, not live quote) */}
            <div className="flex justify-between">
              <span className="text-white/70">To (estimated)</span>
              <span className="text-white font-bold">
                {toAmount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: displayCurrency === "USDC" ? 2 : 2,
                })}{" "}
                {displayCurrency}
              </span>
            </div>

            {exchangeRateDisplay}

            <div className="flex justify-between">
              <span className="text-white/70">Recipient</span>
              <span className="text-white font-mono text-sm">
                {swapData.recipientAddress}
              </span>
            </div>
          </div>
          <Button
            onClick={handleUnifiedSwap}
            className="w-full h-14"
            disabled={
              isCheckingAllowance ||
              isApproving ||
              isWaitingApproval ||
              isExecuting ||
              isWaitingSwap ||
              isSwapSuccess
            }
          >
            {isCheckingAllowance ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Checking Allowance...
              </>
            ) : isApproving || isWaitingApproval ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {isWaitingApproval
                  ? "Finalizing Approval..."
                  : "Approving Token..."}
              </>
            ) : isExecuting || isWaitingSwap ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {isWaitingSwap ? "Finalizing Swap..." : "Executing Swap..."}
              </>
            ) : isSwapSuccess ? (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Swap Successful!
              </>
            ) : needsApproval && !isApproved ? (
              `Approve & Swap ${tokenToApprove}`
            ) : (
              "Confirm Swap"
            )}
          </Button>

          {/* Optional: Informational text during the "gap" */}
          {isAutoSwapping && isWaitingApproval && (
            <p className="text-xs text-center text-white/50 mt-2">
              Please wait. The swap transaction will prompt automatically after
              approval.
            </p>
          )}

          {swapHash && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-green-400" size={20} />
                <span className="text-green-400 font-semibold">
                  Transaction Submitted
                </span>
              </div>
              <code className="text-xs text-white/70 break-all">
                {swapHash}
              </code>
            </div>
          )}
        </div>
      );
    }

    if (step === "pending") {
      return (
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-4 lg:p-6 space-y-4">
          <div className="text-center mb-6">
            <Loader2 className="w-12 h-12 text-secondary animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">
              {activeTab === "buy"
                ? "Waiting for Payment"
                : "Processing Transaction"}
            </h2>
            <p className="text-white/50">
              {activeTab === "buy"
                ? "Please complete the bank transfer. We'll automatically detect your payment."
                : "Your transaction is being processed..."}
            </p>
          </div>

          {reference && (
            <div className="p-4 bg-black/50 rounded-xl">
              <p className="text-white/70 mb-2">Reference</p>
              <code className="text-sm text-white font-mono">{reference}</code>
              {wsConnected && (
                <p className="text-sm text-green-400 mt-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Connected for real-time updates
                </p>
              )}
            </div>
          )}

          {activeTab === "buy" && transactionData?.data?.depositAccount && (
            <>
              <div className="p-4 bg-black/50 rounded-xl">
                <p className="text-white/70 mb-2">Amount to Pay</p>
                <p className="text-3xl font-bold text-white">₦{buyAmount}</p>
              </div>

              <div className="space-y-4 p-4 bg-black/50 rounded-xl">
                <div className="flex justify-between">
                  <span className="text-white/70">Bank Name</span>
                  <span className="text-white">
                    {transactionData.data.depositAccount.bankName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono font-bold">
                      {transactionData.data.depositAccount.accountNumber}
                    </span>
                    <button
                      onClick={async () => {
                        const success = await copyToClipboard(
                          transactionData.data.depositAccount.accountNumber,
                        );
                        if (success) {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                          toast({
                            title: "Copied!",
                            description: "Account number copied",
                            variant: "success",
                          });
                        }
                      }}
                      className="p-1 hover:bg-white/10 rounded"
                    >
                      {copied ? (
                        <CheckCircle size={16} className="text-green-400" />
                      ) : (
                        <Copy size={16} className="text-white/50" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Account Name</span>
                  <span className="text-white">
                    {transactionData.data.depositAccount.accountName}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* {activeTab === "sell" &&
            cryptoType === "CNGN" &&
            transactionData?.data?.depositAddress && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="text-amber-400" size={20} />
                  <span className="text-amber-400 font-semibold">
                    Deposit Address
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-white flex-1 break-all">
                    {transactionData.data.depositAddress}
                  </code>
                  <button
                    onClick={async () => {
                      const success = await copyToClipboard(
                        transactionData.data.depositAddress
                      );
                      if (success) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                        toast({ title: "Copied!", variant: "success" });
                      }
                    }}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    {copied ? (
                      <CheckCircle size={16} className="text-green-400" />
                    ) : (
                      <Copy size={16} className="text-white/50" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-white/70 mt-2">
                  Send your crypto to this address
                </p>
              </div>
            )} */}
          {activeTab === "sell" &&
            cryptoType === "CNGN" &&
            transactionData?.data?.depositAddress && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-4">
                {/* 1. Amount Section */}
                <div>
                  <span className="text-amber-400/80 text-xs font-bold uppercase tracking-wider mb-1 block">
                    Amount to Send
                  </span>
                  <p className="text-2xl font-bold text-white tracking-tight">
                    {sellAmount}{" "}
                    <span className="text-lg font-medium text-amber-400">
                      CNGN
                    </span>
                  </p>
                </div>

                {/* Divider */}
                <div className="h-px bg-amber-500/20 w-full" />

                {/* 2. Address Section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="text-amber-400" size={16} />
                    <span className="text-amber-400/80 text-xs font-bold uppercase tracking-wider">
                      Deposit Address
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg border border-amber-500/10">
                    <code className="text-xs text-white flex-1 break-all font-mono">
                      {transactionData.data.depositAddress}
                    </code>
                    <button
                      onClick={async () => {
                        const success = await copyToClipboard(
                          transactionData.data.depositAddress,
                        );
                        if (success) {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                          toast({ title: "Copied!", variant: "success" });
                        }
                      }}
                      className="p-2 hover:bg-white/10 rounded-md transition-colors"
                    >
                      {copied ? (
                        <CheckCircle size={16} className="text-green-400" />
                      ) : (
                        <Copy size={16} className="text-amber-400/50" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-white/50 mt-2">
                    Please send exactly <strong>{sellAmount} CNGN</strong> to
                    the address above.
                  </p>
                </div>
              </div>
            )}
        </div>
      );
    }

    if (step === "completed") {
      return (
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-4 lg:p-6 space-y-4">
          <div className="text-center mb-6">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Transaction Completed
            </h2>
            <p className="text-white/50">
              Your transaction has been completed successfully
            </p>
          </div>

          {reference && (
            <div className="p-4 bg-black/50 rounded-xl">
              <p className="text-white/70 mb-2">Reference</p>
              <code className="text-sm text-white font-mono">{reference}</code>
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleResetForm}>
              New Transaction
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="bg-background overflow-hidden">
      {/* <GridLines /> */}
      <Header onOpenAuthModal={() => setIsAuthModalOpen(true)} />
      <section className="relative min-h-screen flex items-center pt-32 pb-20 px-6 overflow-hidden">
        <HeroBackground />

        <div className="max-w-5xl mx-auto w-full relative z-10">
          <div className="text-center mb-12">
            <h1 className="text-3xl max-w-2xl mx-auto md:text-5xl font-bold mb-4">
              Move <span className="text-secondary">money</span> between
              <span className="text-secondary"> crypto</span> and your{" "}
              <span className="text-secondary">bank</span>
            </h1>
          </div>
          <div className="max-w-xl mx-auto">{renderContent()}</div>
        </div>
      </section>

      {activeTab === "buy" ? (
        <CryptoSelectionModal
          open={isCryptoModalOpen}
          onOpenChange={setIsCryptoModalOpen}
          selectedCrypto="CNGN"
          onSelect={() => {}}
          showComingSoon={true}
        />
      ) : (
        <CryptoSelectionModal
          open={isCryptoModalOpen}
          onOpenChange={setIsCryptoModalOpen}
          selectedCrypto={cryptoType}
          onSelect={handleCryptoSelect}
        />
      )}

      <CryptoSelectionModal
        open={isFromCryptoModalOpen}
        onOpenChange={setIsFromCryptoModalOpen}
        selectedCrypto={fromCryptoType}
        onSelect={handleFromCryptoSelect}
      />

      <CryptoSelectionModal
        open={isToCryptoModalOpen}
        onOpenChange={setIsToCryptoModalOpen}
        selectedCrypto={toCryptoType}
        onSelect={handleToCryptoSelect}
      />

      <EmailOtpModal
        open={isAuthModalOpen}
        onOpenChange={setIsAuthModalOpen}
        onSuccess={() => {
          if (activeTab === "sell" && sellAmount && bankCode && accountNumber) {
            setTimeout(() => {
              const form = document.querySelector("form") as HTMLFormElement;
              if (form) form.requestSubmit();
            }, 100);
          } else if (activeTab === "buy" && buyAmount && walletAddress) {
            setTimeout(() => {
              const form = document.querySelector("form") as HTMLFormElement;
              if (form) form.requestSubmit();
            }, 100);
          }
        }}
      />
    </div>
  );
}
