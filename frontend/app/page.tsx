"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  ArrowLeft,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { formatNumber, cn, safeBigInt } from "@/lib/utils";
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
  useOffRamp,
  useOnRamp,
  useInitializeSwap,
  useUpdateSwapAfterExecution,
  useSwapWebSocket,
  useCreateSimpleSwap,
  useResolveAccount,
  useBridge,
  useBridgeStatus,
} from "@/lib/hooks";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { parseFormattedNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { stablestackApi, miscApi } from "@/lib/api";
import { ngnAmountForUsdc } from "@/lib/offramp-amount";
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
  useConfig,
  useSignTypedData,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  SWAP_CONSTANTS,
  ERC20_ABI,
} from "@/lib/constants/swap-constants";
import { parseUnits, formatUnits, hexToBigInt, maxUint256, concat } from "viem";
import { QuoteView } from "@/components/swap/QuoteView";
import { UsdcxSwapPanel } from "@/components/swap/usdcx-swap-panel";
import { useTransactionStore, type CryptoType } from "@/lib/store";
import { useStacksWallet } from "@/lib/hooks/use-stacks-wallet";
import { useStellarWallet } from "@/lib/hooks/use-stellar-wallet";
import {
  useSolanaWallet,
  isValidSolanaAddress,
} from "@/lib/hooks/use-solana-wallet";
import axios from "axios";
import { AlertTriangle as LucideAlertTriangle } from "lucide-react";
import { USDC_ADDRESSES } from "@/lib/constants/bridge-constants";
import { explorerTxUrl } from "@/lib/explorers";
import {
  SUPPORTED_CHAINS,
  IS_TESTNET,
  getBridgeChains,
  isStellarChain,
  isSolanaChain,
} from "@/lib/constants/networks";

export default function HomePage() {
  const { toast } = useToast();
  useEffect(() => {
    const onError = (e: Event) =>
      toast({ title: "Stellar wallet", description: String((e as CustomEvent).detail), variant: "destructive" });
    window.addEventListener("stellar-wallet-error", onError);
    return () => window.removeEventListener("stellar-wallet-error", onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: banks = [] } = useBanks();
  const offRamp = useOffRamp();
  const onRamp = useOnRamp();
  const initializeSwap = useInitializeSwap();
  const updateSwap = useUpdateSwapAfterExecution();
  const createSimpleSwap = useCreateSimpleSwap();
  const { address, isConnected } = useAccount();
  const {
    stacksAddress,
    isStacksConnected,
    isConnecting: isStacksConnecting,
    connectStacks,
    disconnectStacks,
  } = useStacksWallet();
  const {
    stellarAddress,
    isStellarConnected,
    isStellarConnecting,
    connectStellar,
    disconnectStellar,
    sendUsdc,
    signStellarTransaction,
  } = useStellarWallet();
  const {
    solanaAddress,
    isSolanaConnected,
    isSolanaConnecting,
    connectSolana,
    disconnectSolana,
  } = useSolanaWallet();

  const activeTab = useTransactionStore((state) => state.activeTab);
  const cryptoType = useTransactionStore((state) => state.cryptoType);
  const buyReceiveType = useTransactionStore((state) => state.buyReceiveType);
  const setBuyReceiveType = useTransactionStore(
    (state) => state.setBuyReceiveType,
  );
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
  // NOTE: USDCX lives on Stacks (no EVM address). For EVM-leg estimation we
  // map it 1:1 to USDC; xReserve redeem/deposit flows bypass 0x quotes.
  const getTokenAddress = useCallback((type: string) => {
    if (type === "USDC") return SWAP_CONSTANTS.USDC;
    if (type === "USDT") return SWAP_CONSTANTS.USDT;
    if (type === "WETH") return SWAP_CONSTANTS.WETH;
    if (type === "USDCX") return SWAP_CONSTANTS.USDC;
    return SWAP_CONSTANTS.CNGN;
  }, []);

  const getTokenDecimals = (type: string) => {
    if (type === "USDC") return SWAP_CONSTANTS.USDC_DECIMALS;
    if (type === "USDT") return SWAP_CONSTANTS.USDT_DECIMALS;
    if (type === "WETH") return SWAP_CONSTANTS.WETH_DECIMALS;
    if (type === "USDCX") return SWAP_CONSTANTS.USDC_DECIMALS;
    return SWAP_CONSTANTS.CNGN_DECIMALS;
  };

  const isXReservePair =
    activeTab === "swap" &&
    (fromCryptoType === "USDCX" || toCryptoType === "USDCX");

  const calculateExchangeRate = (
    fromAmount: number,
    toAmount: bigint,
    decimals: number,
  ) => {
    if (!fromAmount || fromAmount <= 0) return { toAmount: "0", exchangeRate: 0 };
    const formattedToAmount = formatUnits(toAmount, decimals);
    const toAmountNum = parseFloat(formattedToAmount);
    return {
      toAmount: formattedToAmount,
      exchangeRate: toAmountNum / fromAmount,
    };
  };
  const [copied, setCopied] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isAddWalletDialogOpen, setIsAddWalletDialogOpen] = useState(false);
  const [stellarSourceAddress, setStellarSourceAddress] = useState("");
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isBuyConfirmationModalOpen, setIsBuyConfirmationModalOpen] =
    useState(false);

  // Auto-fill the Stellar source address when a Stellar wallet connects.
  useEffect(() => {
    if (stellarAddress) {
      setStellarSourceAddress(stellarAddress);
    } else if (typeof window !== "undefined") {
      const saved = localStorage.getItem("stellar-wallet-address");
      if (saved) setStellarSourceAddress(saved);
    }
  }, [stellarAddress]);
  const [isSendingUsdc, setIsSendingUsdc] = useState(false);
  const [sentUsdcHash, setSentUsdcHash] = useState<string | null>(null);
  const [sendUsdcError, setSendUsdcError] = useState<string | null>(null);
  const [isFromChainModalOpen, setIsFromChainModalOpen] = useState(false);
  const [isToChainModalOpen, setIsToChainModalOpen] = useState(false);
  /** Bridge-only reference (bridges don't go through the swap transaction flow). */
  const [bridgeRef, setBridgeRef] = useState<string | undefined>(undefined);

  const fromChain = useTransactionStore((state) => state.fromChain);
  const toChain = useTransactionStore((state) => state.toChain);
  const setFromChain = useTransactionStore((state) => state.setFromChain);
  const setToChain = useTransactionStore((state) => state.setToChain);
  const rampNetwork = useTransactionStore((state) => state.rampNetwork);
  const setRampNetwork = useTransactionStore((state) => state.setRampNetwork);

  const [quoteAmountOut, setQuoteAmountOut] = useState<bigint>(0n);
  const [showQuote, setShowQuote] = useState(false);
  const [priceDataForQuote, setPriceDataForQuote] = useState<any>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(0);
  // Buy tab: NGN -> USDC/USDT at Bitnob's onramp rate for the selected chain.
  const [buyRate, setBuyRate] = useState<number | null>(null);
  const [isBuyRateLoading, setIsBuyRateLoading] = useState(false);
  const [isLiquidityAvailable, setIsLiquidityAvailable] = useState(true);
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const config = useConfig();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isUnsupportedNetwork = isConnected && !SUPPORTED_CHAINS.some(c => c.id === chainId);
  const targetChain = IS_TESTNET ? 84532 : 8453; // Base Sepolia or Base Mainnet
  const targetChainName = IS_TESTNET ? "Base Sepolia" : "Base";

  const {
    sendTransactionAsync: executeSwap,
    data: swapHash,
    isPending: isExecuting,
  } = useSendTransaction();
  const {
    isLoading: isWaitingSwap,
    isSuccess: isSwapSuccess,
    isError: isSwapReceiptError,
    error: swapReceiptError,
  } = useWaitForTransactionReceipt({ hash: swapHash });

  const hasUpdatedSwap = useRef(false);
  const isSubmittingSwap = useRef(false);

  const bridgeChains = getBridgeChains();
  const { executeBridge, isBridging, bridgeResult } = useBridge();

  const parsedSellAmount = sellAmount ? parseFormattedNumber(sellAmount) : null;
  const parsedBuyAmount = buyAmount ? parseFormattedNumber(buyAmount) : null;

  // Handle swap execution via Permit2: approve (once) → sign EIP-712 (free) → swap (1 tx)
  const handleExecuteSwap = useCallback(async () => {
    if (isSubmittingSwap.current) return;
    isSubmittingSwap.current = true;

    if (!address || !swapData) {
      toast({
        title: "Swap Error",
        description: "Missing wallet address or swap data. Please try again.",
        variant: "destructive",
      });
      isSubmittingSwap.current = false;
      return;
    }

    const isTokenInUSDC =
      swapData.swapParams.tokenIn.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase();
    const isTokenInUSDT =
      swapData.swapParams.tokenIn.toLowerCase() === SWAP_CONSTANTS.USDT.toLowerCase();
    const tokenAddress = isTokenInUSDC
      ? SWAP_CONSTANTS.USDC
      : isTokenInUSDT
        ? SWAP_CONSTANTS.USDT
        : SWAP_CONSTANTS.CNGN;

    const amountIn = safeBigInt(swapData.swapParams.amountIn);
    const slippage = isTokenInUSDT
      ? Math.max(swapData.swapParams.slippage || 0.05, 0.1)
      : swapData.swapParams.slippage || 0.05;

    const fetchPermit2Quote = async () => {
      const res = await axios.get("/api/swap/permit2-quote", {
        params: {
          sellToken: swapData.swapParams.tokenIn,
          buyToken: swapData.swapParams.tokenOut,
          sellAmount: amountIn.toString(),
          taker: address,
          slippagePercentage: slippage,
          chainId: chainId || 8453,
        },
      });
      return res.data;
    };

    try {
      // 1. Fetch Permit2 quote
      let quote = await fetchPermit2Quote();

      if (!quote?.transaction) {
        throw new Error("Invalid swap quote: missing transaction data");
      }

      // 2. One-time approval if needed — await on-chain confirmation, then re-fetch a fresh quote
      if (quote.issues?.allowance) {
        const spender = quote.issues.allowance.spender as `0x${string}`;
        setIsApproving(true);

        const approveHash = await writeContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender, maxUint256],
        });

        await waitForTransactionReceipt(config, { hash: approveHash });
        setIsApproving(false);

        // Re-fetch quote — old one may have expired during the approval wait
        quote = await fetchPermit2Quote();
        if (!quote?.transaction) {
          throw new Error("Failed to get fresh quote after approval");
        }
      }

      // 3. Sign EIP-712 Permit2 message (off-chain, no gas)
      //    Strip EIP712Domain from types — wagmi derives it from domain internally;
      //    including it explicitly causes MetaMask to produce a malformed signature.
      let txData = quote.transaction.data as `0x${string}`;
      if (quote.permit2?.eip712) {
        setIsSigning(true);
        const { domain, types, message, primaryType } = quote.permit2.eip712;
        const { EIP712Domain: _removed, ...cleanTypes } = types as Record<string, unknown>;
        const signature = await signTypedDataAsync({
          domain,
          types: cleanTypes as any,
          primaryType,
          message,
        });
        txData = concat([txData, signature]) as `0x${string}`;
        setIsSigning(false);
      }

      // 4. Execute swap — single on-chain transaction
      const gasEstimate = quote.transaction.gas ? safeBigInt(quote.transaction.gas) : undefined;
      const gasWithBuffer = gasEstimate ? (gasEstimate * 115n) / 100n : undefined;

      await executeSwap({
        account: address as `0x${string}`,
        to: quote.transaction.to as `0x${string}`,
        data: txData,
        value:
          quote.transaction.value && hexToBigInt(quote.transaction.value) > 0n
            ? hexToBigInt(quote.transaction.value)
            : BigInt(0),
        gas: gasWithBuffer,
        chainId: chainId,
      });
    } catch (error: any) {
      console.error("Swap execution error:", error);
      setIsApproving(false);
      setIsSigning(false);
      // User rejected a wallet popup — silently exit
      if (
        error?.message?.toLowerCase().includes("user rejected") ||
        error?.message?.toLowerCase().includes("user denied")
      ) {
        isSubmittingSwap.current = false;
        return;
      }
      const errorMessage =
        error.response?.data?.reason ||
        error.response?.data?.description ||
        error.message ||
        "Failed to execute swap";
      toast({
        title: "Swap Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      isSubmittingSwap.current = false;
    }
  }, [address, swapData, chainId, config, writeContractAsync, signTypedDataAsync, executeSwap, toast]);

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
        },
      );
    }
  }, [isSwapSuccess, swapHash, swapData, address, step, updateSwap, activeTab, toast]);

  useEffect(() => {
    hasUpdatedSwap.current = false;
  }, [swapHash]);

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
    activeTab === "bridge" && step === "pending"
      ? (bridgeRef ?? reference)
      : undefined,
  );
  // Bridge finished when Circle attested + mint landed (backend) or when the
  // BridgeKit flow itself resolved successfully (frontend ground truth).
  // Gated on bridgeRef so a stale success from a previous attempt can never
  // complete a freshly started one (executeBridge resets bridgeResult).
  const bridgeDone =
    bridgeRef !== undefined &&
    (bridgeStatus?.status === "COMPLETED" || bridgeResult?.state === "success");
  useEffect(() => {
    if (activeTab === "bridge" && step === "pending" && bridgeDone) {
      setStep("completed");
    }
  }, [activeTab, step, bridgeDone, setStep]);



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

  const { data: wethBalance } = useReadContract({
    address: SWAP_CONSTANTS.WETH as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address && isConnected && activeTab === "swap",
    },
  });


  const tabs = [
    { id: "buy" as const, label: "Buy" },
    { id: "sell" as const, label: "Sell" },
    { id: "swap" as const, label: "Swap" },
    { id: "bridge" as const, label: "Bridge" },
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

  const handleCryptoSelect = (type: "CNGN" | "USDC" | "USDT" | "WETH" | "USDCX") => {
    // USDCx lives only on Stacks — not offered on Buy/Sell (EVM-only flows)
    if (type === "USDCX") return;
    setCryptoType(type as "CNGN" | "USDC" | "USDT" | "WETH");
    setIsCryptoModalOpen(false);
  };

  const handleBuyReceiveSelect = (type: CryptoType) => {
    if (type !== "CNGN" && type !== "USDC") return;
    setBuyReceiveType(type);
    setIsCryptoModalOpen(false);
  };

  // Same token on the same chain is never a swap (USDC->USDC, USDCx->USDCx).
  // USDCx lives only on Stacks, so it only pairs cross-chain:
  //  - redeem: USDCx -> USDC (or USDCx -> CNGN via auto-swap on Base)
  //  - deposit: USDC -> USDCx  (xReserve deposit only accepts USDC)
  const isValidSwapPair = useCallback((from: CryptoType, to: CryptoType) => {
    if (from === to) return false;
    if (from === "USDCX") return to === "USDC" || to === "CNGN";
    if (to === "USDCX") return from === "USDC";
    return true;
  }, []);

  // Options that would create an invalid pair with the opposite side
  const disabledFromOptions = (
    ["CNGN", "USDC", "USDT", "WETH", "USDCX"] as CryptoType[]
  ).filter((t) => !isValidSwapPair(t, toCryptoType));
  const disabledToOptions = (
    ["CNGN", "USDC", "USDT", "WETH", "USDCX"] as CryptoType[]
  ).filter((t) => !isValidSwapPair(fromCryptoType, t));

  const handleFromCryptoSelect = (type: "CNGN" | "USDC" | "USDT" | "WETH" | "USDCX") => {
    setIsFromCryptoModalOpen(false);
    if (!isValidSwapPair(type, toCryptoType)) return;
    setFromCryptoType(type);
  };

  const handleToCryptoSelect = (type: "CNGN" | "USDC" | "USDT" | "WETH" | "USDCX") => {
    setIsToCryptoModalOpen(false);
    if (!isValidSwapPair(fromCryptoType, type)) return;
    setToCryptoType(type);
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
    setShowQuote(false);
    setStellarSourceAddress("");
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


  useEffect(() => {
    const fetchQuote = async () => {
      if (!shouldFetchQuote || !quoteTokenIn || !quoteTokenOut || parsedQuoteAmount <= 0n) {
        setQuoteAmountOut(0n);
        setExchangeRate(0);
        return;
      }

      // xReserve pairs (USDCx <-> USDC/CNGN) are 1:1 minus bridge fees —
      // no 0x liquidity. Estimate par so the Swap tab can route to
      // deposit (EVM->Stacks) or redeem (Stacks->Base) flows.
      if (
        activeTab === "swap" &&
        (fromCryptoType === "USDCX" || toCryptoType === "USDCX")
      ) {
        setIsQuoteLoading(false);
        setIsLiquidityAvailable(true);
        // Scale across decimals (all 6dp today, keep generic)
        const outAmount =
          quoteDecimalsIn === quoteDecimalsOut
            ? parsedQuoteAmount
            : (parsedQuoteAmount * 10n ** BigInt(quoteDecimalsOut)) /
              10n ** BigInt(quoteDecimalsIn);
        setQuoteAmountOut(outAmount);
        setPriceDataForQuote({
          buyAmount: outAmount.toString(),
          xReserve: true,
          route:
            fromCryptoType === "USDCX"
              ? "USDCx (Stacks) -> USDC (Base) via xReserve redeem"
              : "USDC (Base) -> USDCx (Stacks) via xReserve deposit",
        });
        const { exchangeRate: rate } = calculateExchangeRate(
          parseFormattedNumber(sellAmount),
          outAmount,
          quoteDecimalsOut,
        );
        setExchangeRate(rate);
        return;
      }

      setIsQuoteLoading(true);
      setIsLiquidityAvailable(true); // Reset before fetch

      // Sell USDC/USDT -> NGN: price it with Bitnob's offramp rate for the selected chain (the provider
      // that pays out), not an on-chain 0x quote.
      if (isSellQuoteMode) {
        try {
          const usdAmount = parseFormattedNumber(sellAmount);
          const { data } = await miscApi.getUsdNgnRate(undefined, { network: rampNetwork, direction: "offramp" });
          const rate = Number(data.rate);
          if (!Number.isFinite(rate) || rate <= 0 || !(usdAmount > 0)) throw new Error("no rate");
          const out = parseUnits((usdAmount * rate).toFixed(quoteDecimalsOut), quoteDecimalsOut);
          setQuoteAmountOut(out);
          setPriceDataForQuote({ buyAmount: out.toString(), source: data.source ?? "bitnob", rate });
          setExchangeRate(rate);
        } catch (error) {
          console.error("Bitnob rate error:", error);
          setQuoteAmountOut(0n);
          setExchangeRate(0);
        } finally {
          setIsQuoteLoading(false);
        }
        return;
      }

      try {
        const response = await axios.get("/api/swap/price", {
          params: {
            sellToken: quoteTokenIn,
            buyToken: quoteTokenOut,
            sellAmount: parsedQuoteAmount.toString(),
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

        // The 0x price API can return buyAmount as a decimal string (e.g. "0.1").
        // safeBigInt() handles decimals by flooring to the nearest integer.
        const outAmount = safeBigInt(quote.buyAmount);
        setQuoteAmountOut(outAmount);
        setPriceDataForQuote(quote); // Store full data

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
  }, [shouldFetchQuote, quoteTokenIn, quoteTokenOut, parsedQuoteAmount, address, sellAmount, quoteDecimalsOut, activeTab, fromCryptoType, toCryptoType, quoteDecimalsIn, isSellQuoteMode, rampNetwork]);


  useEffect(() => {
    if (activeTab !== "buy" || buyReceiveType !== "USDC" || !buyAmount) {
      setBuyRate(null);
      setIsBuyRateLoading(false);
      return;
    }
    let cancelled = false;
    setIsBuyRateLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await miscApi.getUsdNgnRate(undefined, { network: rampNetwork, direction: "onramp" });
        const r = Number(data.rate);
        if (!cancelled) setBuyRate(Number.isFinite(r) && r > 0 ? r : null);
      } catch (e) {
        console.error("Bitnob buy rate error:", e);
        if (!cancelled) setBuyRate(null);
      } finally {
        if (!cancelled) setIsBuyRateLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeTab, buyReceiveType, buyAmount, rampNetwork]);

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

    const effectiveStellarSource =
      stellarSourceAddress ||
      stellarAddress ||
      (typeof window !== "undefined"
        ? localStorage.getItem("stellar-wallet-address") || ""
        : "");

    if (rampNetwork === "stellar" && !effectiveStellarSource.startsWith("G")) {
      toast({
        title: "Invalid Stellar address",
        description: "Please enter a valid Stellar source address",
        variant: "destructive",
      });
      return;
    }

    if (
      (cryptoType === "USDC" || cryptoType === "USDT") &&
      rampNetwork !== "stellar" &&
      !isConnected
    ) {
      toast({
        title: "Wallet not connected",
        description: "Connect your wallet to sell USDC/USDT",
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
          network: rampNetwork,
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
      if (rampNetwork === "stellar") {
        const effectiveStellarSource =
          stellarSourceAddress ||
          stellarAddress ||
          (typeof window !== "undefined"
            ? localStorage.getItem("stellar-wallet-address") || ""
            : "");
        // The order API takes a NAIRA amount (min ₦2,000); the form collects USDC, so convert at the live rate.
        const usdcAmount = Number(parseFloat(sellAmount.replace(/,/g, "")).toFixed(6));
        void (async () => {
          let rate: number | null = null;
          try {
            rate = (await miscApi.getUsdNgnRate(undefined, { network: rampNetwork, direction: "offramp" })).data.rate;
          } catch {
            rate = null;
          }
          const result = rate ? ngnAmountForUsdc(usdcAmount, rate) : null;
          if (!result || !result.ok) {
            setIsConfirmationModalOpen(false);
            toast({
              title: !result ? "Rate unavailable" : result.reason === "below_minimum" ? "Amount too small" : "Invalid amount",
              description: !result
                ? "We couldn't get the current USDC/NGN rate. Please try again in a moment."
                : result.reason === "below_minimum"
                  ? `The minimum cash-out is ₦2,000 (about ${result.minUsdc} USDC).`
                  : "Enter a valid USDC amount.",
              variant: "destructive",
            });
            return;
          }
          offRamp.mutate(
            {
              network: rampNetwork,
              amount: result.ngn,
              destination: { bankCode, accountNumber },
              sourceAddress: effectiveStellarSource,
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
        })();
        return;
      }

      const projectedNgnAmount = parseFloat(
        formatUnits(quoteAmountOut, SWAP_CONSTANTS.CNGN_DECIMALS),
      );

      // Re-using initializeSwap which currently expects usdcAmount.
      initializeSwap.mutate(
        {
          amount: Math.round(parseFloat(formatUnits(quoteAmountOut, SWAP_CONSTANTS.CNGN_DECIMALS))),
          usdcAmount: Number(parseFloat(sellAmount.replace(/,/g, "")).toFixed(6)),
          slippage: 0.05,
          network: rampNetwork,
          offrampDestination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response: { data: any }) => {
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

  // Handle bridge: USDC Base -> Stellar (D2), or between the supported EVM chains.
  const handleBridge = async () => {
    if (!isAuthenticated()) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!sellAmount) {
      toast({
        title: "Missing amount",
        description: "Please enter an amount to bridge",
        variant: "destructive",
      });
      return;
    }

    if (fromChain === toChain) {
      toast({
        title: "Invalid chains",
        description: "Source and destination chains must be different",
        variant: "destructive",
      });
      return;
    }

    const sourceIsStellar = isStellarChain(fromChain);
    const sourceIsSolana = isSolanaChain(fromChain);
    const destinationIsStellar = isStellarChain(toChain);
    const destinationIsSolana = isSolanaChain(toChain);

    const effectiveStellarAddress =
      stellarSourceAddress ||
      stellarAddress ||
      (typeof window !== "undefined"
        ? localStorage.getItem("stellar-wallet-address") || ""
        : "");
    const effectiveSolanaAddress =
      solanaAddress ||
      (typeof window !== "undefined"
        ? localStorage.getItem("solana-wallet-address") || ""
        : "");

    // --- Source wallet gating (must own/hold the source chain's assets) ---
    let sourceAddress = address || "";
    if (sourceIsStellar) {
      sourceAddress = effectiveStellarAddress;
      if (!sourceAddress.startsWith("G")) {
        toast({
          title: "Connect Stellar wallet",
          description:
            "Bridging from Stellar requires a connected Stellar wallet.",
          variant: "destructive",
        });
        return;
      }
    } else if (sourceIsSolana) {
      sourceAddress = effectiveSolanaAddress;
      if (!isValidSolanaAddress(sourceAddress)) {
        toast({
          title: "Connect Solana wallet",
          description:
            "Bridging from Solana requires a connected Solana wallet.",
          variant: "destructive",
        });
        return;
      }
    } else if (!isConnected || !sourceAddress.startsWith("0x")) {
      toast({
        title: "Connect EVM wallet",
        description: "Bridging from an EVM chain requires an EVM wallet.",
        variant: "destructive",
      });
      return;
    }

    // --- Destination address gating (must be the right address format) ---
    // A valid manually-entered destination wins; otherwise fall back to the
    // connected wallet on that chain.
    let recipientAddress = walletAddress || address || "";
    if (destinationIsStellar) {
      recipientAddress =
        walletAddress && walletAddress.startsWith("G")
          ? walletAddress
          : effectiveStellarAddress;
      if (!recipientAddress.startsWith("G")) {
        toast({
          title: "Stellar destination required",
          description:
            "Connect or enter a valid Stellar destination address (G…).",
          variant: "destructive",
        });
        return;
      }
    } else if (destinationIsSolana) {
      recipientAddress =
        walletAddress && isValidSolanaAddress(walletAddress)
          ? walletAddress
          : effectiveSolanaAddress;
      if (!isValidSolanaAddress(recipientAddress)) {
        toast({
          title: "Solana destination required",
          description: "Connect or enter a valid Solana destination address.",
          variant: "destructive",
        });
        return;
      }
    } else if (!recipientAddress.startsWith("0x")) {
      toast({
        title: "EVM destination required",
        description: "Connect or enter a valid EVM destination address.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Show the status card up front: the CCTP flow can take minutes and
      // the user should follow it (reference, tx hashes, ticks) while the
      // wallet prompts happen, instead of a frozen button.
      setBridgeRef(undefined);
      setStep("pending");
      const outcome = await executeBridge(
        {
          fromChain,
          toChain,
          amount: sellAmount.replace(/,/g, ""),
          sourceAddress,
          recipientAddress,
          stellarSigner: isStellarConnected ? signStellarTransaction : undefined,
          stellarWalletAddress: stellarAddress ?? undefined,
        },
        setBridgeRef,
      );

      if (outcome?.state === "success") {
        setStep("completed");
      } else if (!outcome) {
        // validation / wallet not connected — back to the form
        setStep("form");
      }
      // state === "pending": stay on the status card; ticks below finish it.
    } catch (error) {
      // Error already toasted in useBridge
      setStep("form");
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

    if (rampNetwork === "stellar" && !walletAddress.startsWith("G")) {
      toast({
        title: "Invalid Stellar address",
        description: "Please enter a valid Stellar destination address",
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
        network: rampNetwork,
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


  // Handle swap: USDC ↔ CNGN (simple swap, no offramp)
  const handleSwap = async () => {
    // xReserve pairs (USDCx) route through the review panel, not 0x execution
    if (isXReservePair) {
      if (!isConnected || !address) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet to continue",
          variant: "destructive",
        });
        return;
      }
      if (!sellAmount || parseFormattedNumber(sellAmount) <= 0) {
        toast({
          title: "Invalid amount",
          description: "Please enter a valid amount",
          variant: "destructive",
        });
        return;
      }
      if (!quoteAmountOut || quoteAmountOut === 0n) {
        toast({
          title: "Quote not ready",
          description: "Wait for the quote to load before reviewing.",
          variant: "destructive",
        });
        return;
      }
      setShowQuote(true);
      return;
    }

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
    const isInUSDC = fromCryptoType === "USDC";
    const isInUSDT = fromCryptoType === "USDT";
    const tokenInDecimals = isInUSDC
      ? SWAP_CONSTANTS.USDC_DECIMALS
      : isInUSDT
        ? SWAP_CONSTANTS.USDT_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;

    const isToUSDC = toCryptoType === "USDC";
    const isToUSDT = toCryptoType === "USDT";
    const tokenOutDecimals = isToUSDC
      ? SWAP_CONSTANTS.USDC_DECIMALS
      : isToUSDT
        ? SWAP_CONSTANTS.USDT_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;

    // Fix: Use atomic units for amountIn in swapParams to ensure correct allowance checks
    const amountInAtomic = parseUnits(sellAmount.replace(/,/g, ""), tokenInDecimals);

    const { toAmount, exchangeRate } = calculateExchangeRate(
      parsedAmount,
      quoteAmountOut,
      tokenOutDecimals,
    );

    const getTokenAddress = (type: string) => {
      if (type === "USDC") return SWAP_CONSTANTS.USDC;
      if (type === "USDT") return SWAP_CONSTANTS.USDT;
      if (type === "WETH") return SWAP_CONSTANTS.WETH;
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
        amountIn: amountInAtomic.toString(), // Use atomic units
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
    } else if (fromCryptoType === "WETH" && wethBalance !== undefined) {
      activeBalance = formatUnits(wethBalance, SWAP_CONSTANTS.WETH_DECIMALS);
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
                  onClick={
                    activeTab === "swap"
                      ? () => {
                          // Never flip into an invalid pair (e.g. CNGN -> USDCx)
                          if (!isValidSwapPair(toCryptoType, fromCryptoType)) {
                            return;
                          }
                          const temp = fromCryptoType;
                          setFromCryptoType(toCryptoType);
                          setToCryptoType(temp);
                        }
                      : undefined
                  }
                  disabled={
                    activeTab === "swap" &&
                    !isValidSwapPair(toCryptoType, fromCryptoType)
                  }
                  className={`w-12 h-12 rounded-full bg-secondary hover:bg-secondary/90 flex items-center justify-center transition-colors shadow-lg ${
                    activeTab === "swap" &&
                    !isValidSwapPair(toCryptoType, fromCryptoType)
                      ? "opacity-40 cursor-not-allowed"
                      : ""
                  }`}
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
                        if (buyReceiveType === "USDC") {
                          if (isBuyRateLoading) return "...";
                          if (!buyRate) return "—";
                          return (parsed / buyRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
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

                            return parseFloat(formatted).toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            );
                          }
                          return "0.00";
                        })()
                      : (() => {
                          if (!sellAmount) return "";
                          const parsed = parseFormattedNumber(sellAmount);
                          return parsed.toLocaleString("en-NG");
                        })()
                }
                onAmountChange={() => {}}
                currencyType={
                  activeTab === "buy"
                    ? buyReceiveType
                    : activeTab === "swap"
                      ? (toCryptoType as "CNGN" | "USDC" | "USDT")
                      : "NGN"
                }
                onCurrencyClick={
                  activeTab === "buy"
                    ? () => setIsCryptoModalOpen(true)
                    : activeTab === "swap"
                      ? () => setIsToCryptoModalOpen(true)
                      : undefined
                }
                disabled={true}
                isLoading={activeTab === "swap" && isQuoteLoading}
                footer={activeTab === "buy" && buyReceiveType === "USDC" && buyAmount ? (
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-white/40">Rate (Bitnob):</span>
                    <span className="text-white/60 font-medium">
                      {buyRate
                        ? `1 ${buyReceiveType} = ₦${buyRate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : isBuyRateLoading ? "fetching…" : "rate unavailable"}
                    </span>
                  </div>
                ) : activeTab === "swap" && priceDataForQuote ? (
                  <div className="flex flex-col gap-1 text-[10px]">
                    <div className="flex justify-between items-center">
                      <span className="text-white/40">Indicative Rate:</span>
                      <span className="text-white/60 font-medium">
                        1 {fromCryptoType} = {exchangeRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {toCryptoType}
                      </span>
                    </div>
                  </div>
                ) : undefined}
              />

              {activeTab === "swap" && !showQuote && (
                <div className="space-y-4">
                  {/* Warn when USDT is used — USDC has better liquidity for CNGN */}
                  {fromCryptoType === "USDT" && toCryptoType === "CNGN" && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                      <LucideAlertTriangle className="text-yellow-400 w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p className="text-yellow-300/80 text-xs">
                        USDT → CNGN has limited liquidity. For best results, use <strong>USDC</strong> instead — it has a direct pool with CNGN. Minimum recommended: <strong>1 USDT</strong>.
                      </p>
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated()) {
                        setIsAuthModalOpen(true);
                        return;
                      }
                      const parsed = parseFormattedNumber(sellAmount);
                      if (fromCryptoType === "CNGN" && parsed < 100) {
                        toast({ title: "Amount too low", description: "Minimum swap amount is 100 CNGN", variant: "destructive" });
                        return;
                      }
                      if (fromCryptoType === "USDT" && parsed < 1) {
                        toast({ title: "Amount too low", description: "Minimum swap amount for USDT is 1 USDT. Use USDC for smaller amounts.", variant: "destructive" });
                        return;
                      }
                      if (toCryptoType === "CNGN" && quoteAmountOut < parseUnits("100", SWAP_CONSTANTS.CNGN_DECIMALS)) {
                        toast({ title: "Amount too low", description: "Minimum received amount is 100 CNGN", variant: "destructive" });
                        return;
                      }
                      setShowQuote(true);
                    }}
                    disabled={isQuoteLoading || !priceDataForQuote || !isLiquidityAvailable || !isConnected}
                    className="w-full h-14 bg-secondary text-black hover:bg-secondary/90 rounded-xl font-bold"
                  >
                    Review Trade
                  </Button>
                </div>
              )}

              {activeTab === "swap" && showQuote && isXReservePair && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setShowQuote(false)}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80"
                  >
                    <ArrowLeft size={14} /> Back to quote
                  </button>
                  <UsdcxSwapPanel
                    direction={fromCryptoType === "USDCX" ? "redeem" : "deposit"}
                    receiveToken={toCryptoType === "CNGN" ? "CNGN" : "USDC"}
                    defaultAmount={sellAmount}
                  />
                </div>
              )}

              {activeTab === "swap" && showQuote && !isXReservePair && (
                <QuoteView
                  sellToken={getTokenAddress(fromCryptoType)}
                  buyToken={getTokenAddress(toCryptoType)}
                  sellAmount={sellAmount}
                  sellDecimals={getTokenDecimals(fromCryptoType)}
                  buyDecimals={getTokenDecimals(toCryptoType)}
                  chainId={chainId || targetChain}
                  priceData={priceDataForQuote}
                  onBack={() => setShowQuote(false)}
                  onTxSubmitted={(hash, buyAmount) => {
                    createSimpleSwap.mutate(
                      {
                        fromTokenType: fromCryptoType,
                        toTokenType: toCryptoType,
                        fromAmount: parseFloat(sellAmount.replace(/,/g, "")),
                        toAmount: parseFloat(buyAmount),
                        exchangeRate: parseFloat(buyAmount) / parseFloat(sellAmount.replace(/,/g, "")),
                        sourceAddress: address!,
                        destinationAddress: walletAddress || address!,
                        network: "base",
                        slippage: 0.05,
                      },
                      {
                        onSuccess: (response) => {
                          updateSwap.mutate({
                            reference: response.data.reference,
                            data: { transactionHash: hash, sourceAddress: address! },
                          });
                        },
                      }
                    );
                  }}
                  onSuccess={(hash) => {
                    setShowQuote(false);
                    setStep("completed");
                  }}
                />
              )}
            </>
          )}

          {(activeTab === "buy" ||
            (activeTab === "swap" && !isXReservePair) ||
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
              {rampNetwork !== "stellar" &&
                !(
                  activeTab === "bridge" &&
                  (isStellarChain(fromChain) || isSolanaChain(fromChain))
                ) && (
                <div className="flex md:items-center justify-between items-center mb-2">
                  <span className="text-sm text-white/70 font-normal">
                    Wallet Connection
                  </span>
                  <ConnectButton showBalance={false} />
                </div>
              )}
              {activeTab === "swap" && (
                <div className="flex md:items-center justify-between items-center mb-2 pt-2 border-t border-white/10">
                  <div className="flex flex-col">
                    <span className="text-sm text-white/70 font-normal">
                      Stacks Wallet
                    </span>
                    <span className="text-[10px] text-white/40">
                      For USDCx (Leather / Xverse)
                    </span>
                  </div>
                  {isStacksConnected && stacksAddress ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white/70 max-w-[140px] truncate">
                        {stacksAddress.slice(0, 6)}…{stacksAddress.slice(-4)}
                      </span>
                      <button
                        type="button"
                        onClick={() => disconnectStacks()}
                        className="text-xs text-white/40 hover:text-white/70 underline"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => connectStacks()}
                      disabled={isStacksConnecting}
                      className="bg-secondary text-black hover:bg-secondary/90 rounded-lg text-xs font-semibold h-8"
                    >
                      {isStacksConnecting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Connect Stacks"
                      )}
                    </Button>
                  )}
                </div>
              )}
              {(rampNetwork === "stellar" ||
                (activeTab === "bridge" &&
                  (isStellarChain(fromChain) ||
                    isStellarChain(toChain)))) && (
                <div className="flex md:items-center justify-between items-center mb-2 pt-2 border-t border-white/10">
                  <div className="flex flex-col">
                    <span className="text-sm text-white/70 font-normal">
                      Stellar Wallet
                    </span>
                    <span className="text-[10px] text-white/40">
                      {activeTab === "bridge" && isStellarChain(fromChain)
                        ? "Required to bridge from Stellar"
                        : "USDC destination (Varial / xBull / Albedo / Lobstr)"}
                    </span>
                  </div>
                  {isStellarConnected && stellarAddress ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white/70 max-w-[140px] truncate">
                        {stellarAddress.slice(0, 6)}…{stellarAddress.slice(-4)}
                      </span>
                      <button
                        type="button"
                        onClick={() => disconnectStellar()}
                        className="text-xs text-white/40 hover:text-white/70 underline"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => connectStellar()}
                      disabled={isStellarConnecting}
                      className="bg-secondary text-black hover:bg-secondary/90 rounded-lg text-xs font-semibold h-8"
                    >
                      {isStellarConnecting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Connect Stellar"
                      )}
                    </Button>
                  )}
                </div>
              )}
              {activeTab === "bridge" &&
                (isSolanaChain(fromChain) || isSolanaChain(toChain)) && (
                  <div className="flex md:items-center justify-between items-center mb-2 pt-2 border-t border-white/10">
                    <div className="flex flex-col">
                      <span className="text-sm text-white/70 font-normal">
                        Solana Wallet
                      </span>
                      <span className="text-[10px] text-white/40">
                        {isSolanaChain(fromChain)
                          ? "Required to bridge from Solana"
                          : "USDC destination (Phantom / Solflare)"}
                      </span>
                    </div>
                    {isSolanaConnected && solanaAddress ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white/70 max-w-[140px] truncate">
                          {solanaAddress.slice(0, 6)}…{solanaAddress.slice(-4)}
                        </span>
                        <button
                          type="button"
                          onClick={() => disconnectSolana()}
                          className="text-xs text-white/40 hover:text-white/70 underline"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          connectSolana().catch((err: Error) =>
                            toast({
                              title: "Solana wallet",
                              description: err.message,
                              variant: "destructive",
                            }),
                          )
                        }
                        disabled={isSolanaConnecting}
                        className="bg-secondary text-black hover:bg-secondary/90 rounded-lg text-xs font-semibold h-8"
                      >
                        {isSolanaConnecting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Connect Solana"
                        )}
                      </Button>
                    )}
                  </div>
                )}
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

          {(activeTab === "buy" || activeTab === "sell") && (
            <div className="flex items-center gap-2 p-3 bg-black/50 rounded-xl border border-white/10">
              <span className="text-xs text-white/50 mr-auto">Network</span>
              {(["base", "bsc", "stellar"] as const).map((net) => (
                <button
                  key={net}
                  type="button"
                  onClick={() => {
                    setRampNetwork(net);
                    if (activeTab === "buy") {
                      setBuyReceiveType(net === "stellar" ? "USDC" : "CNGN");
                    }
                    if (activeTab === "sell" && isConnected && net !== "stellar") {
                      const chainId = net === "bsc"
                        ? (IS_TESTNET ? 97 : 56)
                        : (IS_TESTNET ? 84532 : 8453);
                      switchChain?.({ chainId });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    rampNetwork === net
                      ? "bg-secondary text-black"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {net === "base" ? "Base" : net === "bsc" ? "BSC" : "Stellar"}
                </button>
              ))}
            </div>
          )}

            {activeTab !== "swap" && (
              <Button
                type="submit"
                className="w-full h-14 text-sm md:font-medium rounded-xl bg-secondary hover:bg-secondary/90 text-black"
                disabled={
                  (activeTab === "sell" &&
                    (!accountResolved || !accountName || resolveAccount.isPending))
                }
                isLoading={
                  (activeTab === "sell" && offRamp.isPending) ||
                  (activeTab === "sell" &&
                    cryptoType === "USDC" &&
                    initializeSwap.isPending) ||
                  (activeTab === "buy" && onRamp.isPending) ||
                  (activeTab === "bridge" && isBridging)
                }
              >
                {activeTab === "buy"
                  ? "BUY"
                  : activeTab === "sell"
                    ? "SELL"
                    : "BRIDGE"}
              </Button>
            )}
            </form>
        </div>
      );
    }

    if (step === "execute" && swapData) {
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
            onClick={handleExecuteSwap}
            className="w-full h-14"
            disabled={
              isApproving ||
              isSigning ||
              isExecuting ||
              isWaitingSwap ||
              isSwapSuccess
            }
          >
            {isApproving ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Approving — confirm in wallet...
              </>
            ) : isSigning ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Sign the message in your wallet...
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
            ) : (
              "Confirm Swap"
            )}
          </Button>

          {isSwapReceiptError && swapHash && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <LucideAlertTriangle className="text-red-400" size={20} />
                <span className="text-red-400 font-semibold">
                  Transaction Reverted
                </span>
              </div>
              <p className="text-red-300/70 text-xs mb-2">
                {swapReceiptError?.message || "The swap transaction was rejected on-chain."}
              </p>
              <code className="text-xs text-white/40 break-all">{swapHash}</code>
            </div>
          )}

          {swapHash && !isSwapReceiptError && (
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

          {(reference || (activeTab === "bridge" && bridgeRef)) && (
            <div className="p-4 bg-black/50 rounded-xl">
              <p className="text-white/70 mb-2">Reference</p>
              <code className="text-sm text-white font-mono">
                {reference || bridgeRef}
              </code>
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
                      href={
                        explorerTxUrl(
                          fromChain,
                          (bridgeResult?.sourceTxHash ||
                            bridgeStatus?.metadata?.SOURCE_TX) as string,
                        ) ?? "#"
                      }
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
                    {isBridging
                      ? "Confirm the transactions in your wallet…"
                      : "Waiting for transaction..."}
                  </div>
                )}
              </div>

              {/* Destination Transaction (once the mint lands) */}
              {(bridgeResult?.destinationTxHash ||
                bridgeStatus?.metadata?.DESTINATION_TX) && (
                <div className="p-4 bg-black/50 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white/70 text-sm">
                      Destination Transaction
                    </span>
                    <a
                      href={
                        explorerTxUrl(
                          toChain,
                          (bridgeResult?.destinationTxHash ||
                            bridgeStatus?.metadata?.DESTINATION_TX) as string,
                        ) ?? "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary text-xs hover:underline flex items-center gap-1"
                    >
                      View on Explorer <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                  <code className="text-xs text-secondary block truncate bg-secondary/10 p-2 rounded">
                    {bridgeResult?.destinationTxHash ||
                      bridgeStatus?.metadata?.DESTINATION_TX}
                  </code>
                </div>
              )}

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
                  {bridgeDone ? (
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
                  {bridgeDone ? (
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
                  <span className="font-bold">Note:</span> Bridging uses
                  Circle CCTP which requires block finality — this can take
                  up to ~20 minutes. You can safely close this window; the
                  transaction will complete automatically.
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

          {activeTab === "sell" &&
            (cryptoType === "USDC" || cryptoType === "USDT") &&
            transactionData?.data?.deposit?.receiveAddress && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-4">
                <div>
                  <span className="text-amber-400/80 text-xs font-bold uppercase tracking-wider mb-1 block">
                    Amount to Send
                  </span>
                  <p className="text-2xl font-bold text-white tracking-tight">
                    {transactionData.data.deposit.amount || sellAmount}{" "}
                    <span className="text-lg font-medium text-amber-400">
                      {cryptoType}
                    </span>
                  </p>
                </div>

                <div className="h-px bg-amber-500/20 w-full" />

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="text-amber-400" size={16} />
                    <span className="text-amber-400/80 text-xs font-bold uppercase tracking-wider">
                      Stellar Deposit Address
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg border border-amber-500/10">
                    <code className="text-xs text-white flex-1 break-all font-mono">
                      {transactionData.data.deposit.receiveAddress}
                    </code>
                    <button
                      onClick={async () => {
                        const success = await copyToClipboard(
                          transactionData.data.deposit.receiveAddress,
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

                  {transactionData.data.deposit.memo && (
                    <p className="text-xs text-white/50 mt-2">
                      Memo: <strong>{transactionData.data.deposit.memo}</strong>
                    </p>
                  )}

                  {transactionData.data.deposit.validUntil && (
                    <p className="text-xs text-white/50 mt-2">
                      Valid until: {new Date(transactionData.data.deposit.validUntil).toLocaleString()}
                    </p>
                  )}

                  <div className="pt-3">
                    <Button
                      type="button"
                      onClick={async () => {
                        try {
                          setIsSendingUsdc(true);
                          setSendUsdcError(null);
                          const hash = await sendUsdc({
                            destination:
                              transactionData.data.deposit.receiveAddress,
                            amount: String(
                              transactionData.data.deposit.amount ||
                                sellAmount,
                            ),
                            memo: transactionData.data.deposit.memo || null,
                            assetCode:
                              transactionData.data.deposit.assetCode || null,
                            assetIssuer:
                              transactionData.data.deposit.assetIssuer || null,
                          });
                          setSentUsdcHash(hash);
                          const ref =
                            transactionData.data.databaseRecord?.reference;
                          if (ref) {
                            await stablestackApi
                              .confirmOfframp(ref, hash)
                              .catch(() => {});
                          }
                          toast({
                            title: "USDC sent",
                            description: hash,
                            variant: "success",
                          });
                        } catch (err) {
                          const msg =
                            err instanceof Error
                              ? err.message
                              : "Failed to send USDC";
                          setSendUsdcError(msg);
                          toast({
                            title: "Send failed",
                            description: msg,
                            variant: "destructive",
                          });
                        } finally {
                          setIsSendingUsdc(false);
                        }
                      }}
                      disabled={!isStellarConnected || isSendingUsdc}
                      className="w-full bg-secondary text-black hover:bg-secondary/90 rounded-lg font-semibold h-11"
                    >
                      {isSendingUsdc ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Send USDC from wallet"
                      )}
                    </Button>

                    {!isStellarConnected && (
                      <p className="text-xs text-white/40 mt-2">
                        Connect your Stellar wallet to send USDC automatically.
                      </p>
                    )}

                    {sentUsdcHash && (
                      <p className="text-xs text-green-400 mt-2 break-all font-mono">
                        Tx:{" "}
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${sentUsdcHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-green-300"
                        >
                          {sentUsdcHash}
                        </a>
                      </p>
                    )}

                    {sendUsdcError && (
                      <p className="text-xs text-red-400 mt-2 break-all">
                        {sendUsdcError}
                      </p>
                    )}
                  </div>
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
    <div className="bg-background overflow-x-hidden">
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
          selectedCrypto={buyReceiveType}
          onSelect={handleBuyReceiveSelect}
          disabledIds={["USDT", "WETH", "USDCX"]}
        />
      ) : (
        <CryptoSelectionModal
          open={isCryptoModalOpen}
          onOpenChange={setIsCryptoModalOpen}
          selectedCrypto={cryptoType}
          onSelect={handleCryptoSelect}
          disabledIds={["USDCX"]}
        />
      )}

      <CryptoSelectionModal
        open={isFromCryptoModalOpen}
        onOpenChange={setIsFromCryptoModalOpen}
        selectedCrypto={fromCryptoType}
        onSelect={handleFromCryptoSelect}
        disabledIds={disabledFromOptions}
      />

      <CryptoSelectionModal
        open={isToCryptoModalOpen}
        onOpenChange={setIsToCryptoModalOpen}
        selectedCrypto={toCryptoType}
        onSelect={handleToCryptoSelect}
        disabledIds={disabledToOptions}
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
        network={rampNetwork === "bsc" ? "BSC" : rampNetwork === "stellar" ? "Stellar" : "Base"}
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
        chains={bridgeChains.filter((chain) => chain !== toChain)}
      />

      <ChainSelectionModal
        open={isToChainModalOpen}
        onOpenChange={setIsToChainModalOpen}
        selectedChain={toChain}
        onSelect={(chain) => {
          setToChain(chain);
          setIsToChainModalOpen(false);
        }}
        chains={bridgeChains.filter((chain) => chain !== fromChain)}
      />

      <Footer />
    </div>
  );
}
