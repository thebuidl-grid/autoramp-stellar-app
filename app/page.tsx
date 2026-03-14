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
  ArrowUpRight,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { formatNumber } from "@/lib/utils";
import { TabButton } from "@/components/swap/tab-button";
import { SwapSection } from "@/components/swap/swap-section";
import { CryptoSelectionModal } from "@/components/swap/crypto-selection-modal";
import { SavedAccountSelector } from "@/components/swap/SavedAccountSelector";
import { OfframpConfirmationModal } from "@/components/swap/offramp-confirmation-modal";
import { SavedWalletSelector } from "@/components/swap/SavedWalletSelector";
import { AddWalletDialog } from "@/components/profile/AddWalletDialog";
import { OnrampConfirmationModal } from "@/components/swap/onramp-confirmation-modal";
import { BridgeSection } from "@/components/swap/bridge-section";
import { ChainSelectionModal } from "@/components/swap/chain-selection-modal";
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
  useSupportedChains,
  useBridge,
  useBridgeStatus,
} from "@/lib/hooks";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { parseFormattedNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { EmailOtpModal } from "@/components/auth/email-otp-modal";
import { copyToClipboard } from "@/lib/utils";
import {
  useAccount,
  useWriteContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useReadContract,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  SWAP_CONSTANTS,
  ERC20_ABI,
} from "@/lib/constants/swap-constants";
import { IS_TESTNET, SUPPORTED_CHAINS } from "@/lib/constants/networks";
import { parseUnits, formatUnits, hexToBigInt } from "viem";
import { useTransactionStore } from "@/lib/store";
import axios from "axios";
import { AlertTriangle as LucideAlertTriangle } from "lucide-react";
import { USDC_ADDRESSES } from "@/lib/constants/bridge-constants";

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
  const [isAddWalletDialogOpen, setIsAddWalletDialogOpen] = useState(false);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isBuyConfirmationModalOpen, setIsBuyConfirmationModalOpen] =
    useState(false);
  const [isFromChainModalOpen, setIsFromChainModalOpen] = useState(false);
  const [isToChainModalOpen, setIsToChainModalOpen] = useState(false);

  const fromChain = useTransactionStore((state) => state.fromChain);
  const toChain = useTransactionStore((state) => state.toChain);
  const setFromChain = useTransactionStore((state) => state.setFromChain);
  const setToChain = useTransactionStore((state) => state.setToChain);

  const { data: supportedChains = [] } = useSupportedChains();
  const { executeBridge, isBridging, bridgeResult } = useBridge();

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
      if (update.status === "COMPLETED") {
        setStep("completed");
        toast({
          title: "Transaction Completed",
          description: "Your transaction has been completed successfully!",
          variant: "success",
        });
      }
    },
    [toast, setStep],
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

  const { data: bridgeStatus } = useBridgeStatus(
    activeTab === "bridge" && step === "pending" ? reference : undefined,
  );



  const { data: cngnBalance } = useReadContract({
    address: SWAP_CONSTANTS.CNGN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address && isConnected,
    },
  });

  const currentUsdcAddress =
    activeTab === "bridge"
      ? USDC_ADDRESSES[fromChain.toLowerCase().replace(/\s+/g, "")] ||
        SWAP_CONSTANTS.USDC
      : SWAP_CONSTANTS.USDC;

  const { data: usdcBalance } = useReadContract({
    address: currentUsdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled:
        !!address &&
        isConnected &&
        (activeTab === "sell" ||
          activeTab === "swap" ||
          activeTab === "bridge"),
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
      : swapData.swapParams.tokenIn.toLowerCase() ===
          SWAP_CONSTANTS.USDT.toLowerCase()
        ? SWAP_CONSTANTS.USDT
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
      address && SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY
        ? ([
            address as `0x${string}`,
            SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY as `0x${string}`,
          ] as const)
        : undefined,
    query: {
      enabled:
        !!address &&
        !!SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY &&
        step === "execute" &&
        !!swapData,
    },
  });

  const {
    writeContract,
    writeContract: approveToken,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();

  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isUnsupportedNetwork = isConnected && !SUPPORTED_CHAINS.some(c => c.id === chainId);
  const targetChain = IS_TESTNET ? 84532 : 8453; // Base Sepolia or Base Mainnet
  const targetChainName = IS_TESTNET ? "Base Sepolia" : "Base";
  const { isLoading: isWaitingApproval, isSuccess: isApproved } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    sendTransaction: executeSwap,
    data: swapHash,
    isPending: isExecuting,
  } = useSendTransaction();
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



  useEffect(() => {
    if (isApproved && isAutoSwapping) {
      handleExecuteSwap();
    }
  }, [isApproved, isAutoSwapping]);

  const tabs = [
    { id: "buy" as const, label: "Buy" },
    { id: "sell" as const, label: "Sell" },
    { id: "swap" as const, label: "Swap" },
    // { id: "bridge" as const, label: "Bridge" },
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
  const getTokenAddress = useCallback((type: string) => {
    if (type === "USDC") return SWAP_CONSTANTS.USDC;
    if (type === "USDT") return SWAP_CONSTANTS.USDT;
    return SWAP_CONSTANTS.CNGN;
  }, []);

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

  // 3. Parse the amount for quoting
  const parsedQuoteAmount = sellAmount
    ? parseUnits(parseFormattedNumber(sellAmount).toString(), quoteDecimalsIn)
    : 0n;

  const [quoteAmountOut, setQuoteAmountOut] = useState<bigint>(0n);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [isLiquidityAvailable, setIsLiquidityAvailable] = useState(true);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!shouldFetchQuote || !quoteTokenIn || !quoteTokenOut || parsedQuoteAmount <= 0n) {
        setQuoteAmountOut(0n);
        setExchangeRate(0);
        return;
      }

      setIsQuoteLoading(true);
      setIsLiquidityAvailable(true); // Reset before fetch
      try {
        const response = await axios.get("/api/swap/quote", {
          params: {
            sellToken: quoteTokenIn,
            buyToken: quoteTokenOut,
            sellAmount: parsedQuoteAmount.toString(),
            ...(address ? { taker: address } : {}),
            slippagePercentage: 0.05,
            chainId: chainId || targetChain, // Dynamic chain support
          },
        });

        const quote = response.data;
        
        // Handle no liquidity
        if (quote.liquidityAvailable === false) {
          setIsLiquidityAvailable(false);
          setQuoteAmountOut(0n);
          setExchangeRate(0);
          return;
        }

        if (!quote || !quote.buyAmount) {
          console.warn("0x Quote: Missing buyAmount in response", quote);
          setQuoteAmountOut(0n);
          setExchangeRate(0);
          return;
        }

        const outAmount = BigInt(quote.buyAmount);
        setQuoteAmountOut(outAmount);

        const { exchangeRate: rate } = calculateExchangeRate(
          parseFormattedNumber(sellAmount),
          outAmount,
          quoteDecimalsOut,
        );
        setExchangeRate(rate);
      } catch (error) {
        console.error("0x Quote Error:", error);
        setQuoteAmountOut(0n);
        setExchangeRate(0);
      } finally {
        setIsQuoteLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounceTimer);
  }, [shouldFetchQuote, quoteTokenIn, quoteTokenOut, parsedQuoteAmount, address, sellAmount, quoteDecimalsOut]);

  // Helper to calculate rate from raw contract data
  const calculateExchangeRate = (
    amountIn: string | number,
    amountOutBigInt: bigint,
    decimalsOut: number,
  ) => {
    const amountInNum = typeof amountIn === 'number' 
      ? amountIn 
      : parseFloat(amountIn.replace(/,/g, ""));
    if (amountInNum <= 0 || amountOutBigInt === 0n) {
      return { toAmount: "0", exchangeRate: 0 };
    }

    const toAmount = formatUnits(amountOutBigInt, decimalsOut);
    const exchangeRate = parseFloat(toAmount) / amountInNum;

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

    // Open confirmation modal
    setIsConfirmationModalOpen(true);
  };

  const handleConfirmSell = () => {
    const parsedAmount = parseFormattedNumber(sellAmount);

    // We already validated inputs in handleSell, so we can proceed with execution

    if (cryptoType === "CNGN") {
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
            setIsConfirmationModalOpen(false);
          },
          onError: () => {
            setIsConfirmationModalOpen(false);
          },
        },
      );
    } else if (cryptoType === "USDC" || cryptoType === "USDT") {
      
      const projectedNgnAmount = parseFloat(
        formatUnits(quoteAmountOut, SWAP_CONSTANTS.CNGN_DECIMALS),
      );

      // Re-using initializeSwap which currently expects usdcAmount.
      initializeSwap.mutate(
        {
          amount: Math.round(parseFloat(formatUnits(quoteAmountOut, SWAP_CONSTANTS.CNGN_DECIMALS))),
          usdcAmount: Number(parseFloat(sellAmount.replace(/,/g, "")).toFixed(6)),
          slippage: 0.05,
          network: "base",
          offrampDestination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response) => {
            const updatedResponse = { ...response.data };
            if (cryptoType === "USDT") {
              if (updatedResponse.swapParams) {
                updatedResponse.swapParams.tokenIn = SWAP_CONSTANTS.USDT;
              }
            }
            setSwapData(updatedResponse);
            setStep("execute");
            setIsConfirmationModalOpen(false);
          },
          onError: () => {
            setIsConfirmationModalOpen(false);
          },
        },
      );
    }
  };

  // Handle bridge: USDC Ethereum to USDC Base (or vice versa)
  const handleBridge = async () => {
    if (!isAuthenticated()) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!sellAmount || !walletAddress) {
      toast({
        title: "Missing fields",
        description: "Please enter amount and destination wallet",
        variant: "destructive",
      });
      return;
    }

    const isMainnet = process.env.NEXT_PUBLIC_NETWORK === "mainnet";
    if (fromChain === toChain && isMainnet) {
      toast({
        title: "Invalid chains",
        description:
          "Source and destination chains must be different on mainnet",
        variant: "destructive",
      });
      return;
    }

    try {
      const reference = await executeBridge({
        fromChain: "Ethereum_Sepolia",
        toChain: "Base_Sepolia",
        amount: sellAmount.replace(/,/g, ""),
        recipientAddress: walletAddress,
      });

      if (reference) {
        setStep("pending");
      }
    } catch (error) {
      // Error handled in useBridge
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

    const sanitizedAmount = buyAmount.replace(/[^0-9.]/g, ""); // removes commas, currency symbols, spaces
    const parsedAmount = parseFloat(sanitizedAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 100) {
      toast({
        title: "Invalid amount",
        description: "Minimum amount is 100 NGN",
        variant: "destructive",
      });
      return;
    }

    // Open confirmation modal
    setIsBuyConfirmationModalOpen(true);
  };

  const handleExecuteBuy = async () => {
    const sanitizedAmount = buyAmount.replace(/[^0-9.]/g, "");
    const parsedAmount = parseFloat(sanitizedAmount);

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
          setIsBuyConfirmationModalOpen(false);
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
      const rawAmountString = swapData.swapParams.amountIn;
      const tokenAmount = parseUnits(rawAmountString, decimals);

      const spender = swapData?.allowanceTarget || SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY;

      approveToken({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender as `0x${string}`, tokenAmount],
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
    if (!address || !swapData || !SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY) return;

    const isTokenInUSDC =
      swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase();
    const isTokenInUSDT =
      swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDT.toLowerCase();

    const decimals = isTokenInUSDC
      ? SWAP_CONSTANTS.USDC_DECIMALS
      : isTokenInUSDT
        ? SWAP_CONSTANTS.USDT_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;

    const amountIn = parseUnits(swapData.swapParams.amountIn.toString(), decimals);

    try {
      // 1. Fetch Quote from our proxy
      const response = await axios.get("/api/swap/quote", {
        params: {
          sellToken: swapData.swapParams.tokenIn,
          buyToken: swapData.swapParams.tokenOut,
          sellAmount: amountIn.toString(),
          taker: address,
          slippagePercentage: swapData.swapParams.slippage || 0.05,
        },
      });

      const quote = response.data;
      
      if (!quote || !quote.transaction) {
        throw new Error("Invalid swap quote: missing transaction data");
      }
      
      // 2. Execute Swap via sendTransaction - v2 returns fields in a nested 'transaction' object
      executeSwap({
        to: quote.transaction.to as `0x${string}`,
        data: quote.transaction.data as `0x${string}`,
        value: quote.transaction.value ? hexToBigInt(quote.transaction.value) : BigInt(0),
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.reason || error.message || "Failed to execute swap";
      toast({ 
        title: "Swap Failed", 
        description: errorMessage, 
        variant: "destructive" 
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
      const minAmount = parseUnits("100", SWAP_CONSTANTS.CNGN_DECIMALS);
      if (quoteAmountOut < minAmount) {
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
        amountIn: sellAmount.replace(/,/g, ""),
        recipient: address,
        slippage: 0.05,
      },
    };

    // 3. Execution
    createSimpleSwap.mutate(
      {
        fromTokenType: fromCryptoType,
        toTokenType: toCryptoType,
        fromAmount: Number(parseFloat(sellAmount.replace(/,/g, "")).toFixed(6)),
        toAmount: Number(parseFloat(toAmount).toFixed(6)),
        exchangeRate,
        sourceAddress: address,
        destinationAddress: walletAddress || address,
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
    } else if (activeTab === "bridge") {
      handleBridge();
    }
  };

  // Determine if approval is needed based on the input token
  const needsApproval =
    swapData &&
    allowance !== undefined &&
    (() => {
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

      const amountIn = parseUnits(swapData.swapParams.amountIn.toString(), decimals);
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
  let activeBalance: string | undefined = undefined;

  if (activeTab === "sell") {
    if (cryptoType === "USDC" && usdcBalance !== undefined) {
      activeBalance = formatUnits(usdcBalance, SWAP_CONSTANTS.USDC_DECIMALS);
    } else if (cryptoType === "CNGN" && cngnBalance !== undefined) {
      activeBalance = formatUnits(cngnBalance, SWAP_CONSTANTS.CNGN_DECIMALS);
    } else if (cryptoType === "USDT" && usdtBalance !== undefined) {
      activeBalance = formatUnits(usdtBalance, SWAP_CONSTANTS.USDT_DECIMALS);
    }
  } else if (activeTab === "swap") {
    if (fromCryptoType === "USDC" && usdcBalance !== undefined) {
      activeBalance = formatUnits(usdcBalance, SWAP_CONSTANTS.USDC_DECIMALS);
    } else if (fromCryptoType === "CNGN" && cngnBalance !== undefined) {
      activeBalance = formatUnits(cngnBalance, SWAP_CONSTANTS.CNGN_DECIMALS);
    } else if (fromCryptoType === "USDT" && usdtBalance !== undefined) {
      activeBalance = formatUnits(usdtBalance, SWAP_CONSTANTS.USDT_DECIMALS);
    }
  } else if (activeTab === "bridge") {
    if (usdcBalance !== undefined) {
      activeBalance = formatUnits(usdcBalance, SWAP_CONSTANTS.USDC_DECIMALS);
    }
  }

  // Render based on step
  const renderContent = () => {
    if (step === "form") {
      return (
        <div
          className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-4 lg:p-6 space-y-4"
        >
          {/* Network Warning */}
          {isUnsupportedNetwork && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-4 mb-2 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-red-500 font-medium">
                <LucideAlertTriangle className="h-5 w-5" />
                <span>Unsupported Network</span>
              </div>
              <p className="text-gray-400 text-xs text-center px-4">
                You are connected to an unsupported network. Please switch to {targetChainName} to continue.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => switchChain?.({ chainId: targetChain })}
                className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-semibold h-9 transition-all active:scale-[0.98]"
              >
                Switch to {targetChainName}
              </Button>
            </div>
          )}

          {activeTab === "swap" && !isLiquidityAvailable && parsedQuoteAmount > 0n && (
            <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-2xl p-4 mb-2 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-yellow-500 font-medium">
                <LucideAlertTriangle className="h-5 w-5" />
                <span>Insufficient Liquidity</span>
              </div>
              <p className="text-gray-400 text-xs text-center px-4">
                We couldn't find enough liquidity for this swap on {targetChainName}. Try a smaller amount or a different token pair.
              </p>
            </div>
          )}
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

            <form onSubmit={handleSubmit} className="space-y-4">
              {activeTab === "bridge" ? (
                <div className="space-y-4">
                  <BridgeSection
                    label="Bridge From"
                    amount={sellAmount}
                    onAmountChange={handleSellAmountChange}
                    chain={fromChain}
                    onChainClick={() => setIsFromChainModalOpen(true)}
                    userBalance={activeBalance}
                    onPercentageClick={handlePercentageClick}
                    direction="from"
                  />
                  <div className="flex justify-center -my-6">
                    <button
                      type="button"
                      className="w-12 h-12 rounded-full bg-secondary hover:bg-secondary/90 flex items-center justify-center transition-colors shadow-lg"
                      onClick={() => {
                        const temp = fromChain;
                        setFromChain(toChain);
                        setToChain(temp);
                      }}
                    >
                      <ArrowUpDown size={18} className="text-black" />
                    </button>
                  </div>
                  <BridgeSection
                    label="Bridge To"
                    amount={sellAmount}
                    onAmountChange={() => {}}
                    chain={toChain}
                    onChainClick={() => setIsToChainModalOpen(true)}
                    direction="to"
                  />
                </div>
              ) : (
                <>
              <SwapSection
                label="You'll send"
                amount={
                  activeTab === "buy"
                    ? buyAmount
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
                        (activeTab === "sell" &&
                          (cryptoType === "USDC" || cryptoType === "USDT"))
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

                            return parseFloat(formatted).toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            );
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
            </>
          )}

          {(activeTab === "buy" ||
            activeTab === "swap" ||
            activeTab === "bridge") && (
            <div className="space-y-4">
              <SavedWalletSelector
                onSelect={(address) => setWalletAddress(address)}
                onAddNew={() => setIsAddWalletDialogOpen(true)}
              />
              <div className="space-y-2">
                <label className="text-sm text-white/70 mb-3 block">
                  Destination Wallet Address
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
                  if (account.accountName) {
                    setAccountName(account.accountName);
                    setAccountResolved(true);
                  }
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

          {activeTab === "sell" ||
          activeTab === "swap" ||
          activeTab === "bridge" ? (
            <div className="p-4 rounded-xl bg-black/50 border border-white/10">
              <div className="flex md:items-center justify-between items-center mb-2">
                <span className="text-sm text-white/70 font-normal">
                  Wallet Connection
                </span>
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
              (activeTab === "sell" &&
                (!accountResolved || !accountName || resolveAccount.isPending)) ||
              (activeTab === "swap" && (!isLiquidityAvailable || quoteAmountOut === 0n))
            }
            isLoading={
              (activeTab === "sell" && offRamp.isPending) ||
              (activeTab === "sell" &&
                cryptoType === "USDC" &&
                initializeSwap.isPending) ||
              (activeTab === "buy" && onRamp.isPending) ||
              (activeTab === "swap" && createSimpleSwap.isPending) ||
              (activeTab === "bridge" && isBridging)
            }
          >
            {activeTab === "buy"
              ? "BUY"
              : activeTab === "sell"
                ? "SELL"
                : activeTab === "swap"
                  ? "SWAP"
                  : "BRIDGE"}
          </Button>
            </form>
        </div>
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

          {activeTab === "bridge" && (
            <div className="space-y-4">
              {/* Source Transaction */}
              <div className="p-4 bg-black/50 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white/70 text-sm">
                    Source Transaction
                  </span>
                  {(bridgeResult?.sourceTxHash ||
                    bridgeStatus?.metadata?.SOURCE_TX) && (
                    <a
                      href={`https://${fromChain.toLowerCase().includes("testnet") || fromChain.toLowerCase().includes("sepolia") ? "sepolia." : ""}etherscan.io/tx/${bridgeResult?.sourceTxHash || bridgeStatus?.metadata?.SOURCE_TX}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary text-xs hover:underline flex items-center gap-1"
                    >
                      View on Explorer <ArrowUpRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {bridgeResult?.sourceTxHash ||
                bridgeStatus?.metadata?.SOURCE_TX ? (
                  <code className="text-xs text-secondary block truncate bg-secondary/10 p-2 rounded">
                    {bridgeResult?.sourceTxHash ||
                      bridgeStatus?.metadata?.SOURCE_TX}
                  </code>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Waiting for transaction...
                  </div>
                )}
              </div>

              {/* Status Steps */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="bg-green-500/20 p-1 rounded-full">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Bridge Initiated
                    </p>
                    <p className="text-xs text-white/50">
                      Transaction sent to Circle
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {bridgeStatus?.status === "COMPLETED" ? (
                    <div className="bg-green-500/20 p-1 rounded-full">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                  ) : (
                    <div className="bg-yellow-500/20 p-1 rounded-full">
                      <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">
                      Circle Attestation
                    </p>
                    <p className="text-xs text-white/50">
                      Waiting for block confirmations (~15 mins)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {bridgeStatus?.status === "COMPLETED" ? (
                    <div className="bg-green-500/20 p-1 rounded-full">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                  ) : (
                    <div className="bg-white/10 p-1 rounded-full">
                      <div className="w-4 h-4 rounded-full border-2 border-white/20" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">
                      Destination Mint
                    </p>
                    <p className="text-xs text-white/50">
                      Funds sent to your wallet
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-200">
                  <span className="font-bold">Note:</span> Bridging involves
                  Circle CCTP which requires block finality. This process can
                  take 15-20 minutes on testnets. You can safely close this
                  window; the transaction will complete automatically.
                </p>
              </div>
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

      <AddWalletDialog
        open={isAddWalletDialogOpen}
        onOpenChange={setIsAddWalletDialogOpen}
      />
      <OfframpConfirmationModal
        open={isConfirmationModalOpen}
        onOpenChange={setIsConfirmationModalOpen}
        onConfirm={handleConfirmSell}
        amount={sellAmount && cryptoType ? `${sellAmount} ${cryptoType}` : ""}
        bankName={
          banks.find((b) => b.institutionCode === bankCode)?.institutionName ||
          "Unknown Bank"
        }
        accountNumber={accountNumber}
        accountName={accountName || "Unknown Account"}
        isLoading={offRamp.isPending || initializeSwap.isPending}
      />
      <OnrampConfirmationModal
        open={isBuyConfirmationModalOpen}
        onOpenChange={setIsBuyConfirmationModalOpen}
        onConfirm={handleExecuteBuy}
        amount={buyAmount}
        walletAddress={walletAddress}
        network="Base"
        isLoading={onRamp.isPending}
      />

      <ChainSelectionModal
        open={isFromChainModalOpen}
        onOpenChange={setIsFromChainModalOpen}
        selectedChain={fromChain}
        onSelect={(chain) => {
          setFromChain(chain);
          setIsFromChainModalOpen(false);
        }}
        chains={supportedChains}
      />

      <ChainSelectionModal
        open={isToChainModalOpen}
        onOpenChange={setIsToChainModalOpen}
        selectedChain={toChain}
        onSelect={(chain) => {
          setToChain(chain);
          setIsToChainModalOpen(false);
        }}
        chains={supportedChains}
      />
    </div>
  );
}
