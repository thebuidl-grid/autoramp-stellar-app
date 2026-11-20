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
import { RampBackdrop } from "@/components/ramp/ramp-backdrop";
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
import { sellProgress } from "@/lib/offramp-status";
import { SellProgressTrack } from "@/components/ramp/sell-progress";
import { ngnAmountForUsdc } from "@/lib/offramp-amount";
import { depositBankName } from "@/lib/deposit-bank";
import { normalizeRampResponse } from "@/lib/ramp-response";
import {
  approveStellarOfframp,
  burnForStellarOfframp,
} from "@/lib/cctp-stellar-source";
import { waitForRelay } from "@/lib/stellar-offramp-relay";
import {
  RAMP_COUNTRY_LIST,
  effectiveCountry,
  isAccountNumberComplete,
  type RampCountryCode,
} from "@/lib/ramp-countries";
import { EmailOtpModal } from "@/components/auth/email-otp-modal";
import { copyToClipboard } from "@/lib/utils";
import {
  useAccount,
  useDisconnect,
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
import { WalletHub, type WalletEntry } from "@/components/ramp/wallet-hub";
import { LoginGate } from "@/components/ramp/login-gate";
import { useQuery } from "@tanstack/react-query";
import {
  checkStellarFunds,
  fetchStellarFunds,
  usdcNeededForSell,
} from "@/lib/stellar-balance";
import { CurrencySheet, RAMP_NETWORKS } from "@/components/ramp/ramp-pickers";
import { StellarConnectSheet } from "@/components/ramp/stellar-connect-sheet";
import {
  AmountCard,
  DetailCard,
  DetailRow,
  ReferenceCard,
  StatusHeader,
} from "@/components/ramp/processing";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import {
  SWAP_CONSTANTS,
  BSC_CONSTANTS,
  ERC20_ABI,
} from "@/lib/constants/swap-constants";
import { parseUnits, formatUnits, hexToBigInt, maxUint256, concat } from "viem";
import { QuoteView } from "@/components/swap/QuoteView";
import { UsdcxSwapPanel } from "@/components/swap/usdcx-swap-panel";
import {
  useAuthStore,
  useIsAuthenticated,
  useTransactionStore,
  type CryptoType,
} from "@/lib/store";
import { useStacksWallet } from "@/lib/hooks/use-stacks-wallet";
import { useStellarWallet } from "@/lib/hooks/use-stellar-wallet";
import {
  useSolanaWallet,
  isValidSolanaAddress,
} from "@/lib/hooks/use-solana-wallet";
import axios from "axios";
import { AlertTriangle as LucideAlertTriangle } from "lucide-react";
import { USDC_ADDRESSES } from "@/lib/constants/bridge-constants";
import { STELLAR_USDC_ISSUER } from "@/lib/cctp-stellar";
import { explorerTxUrl } from "@/lib/explorers";
import {
  SUPPORTED_CHAINS,
  IS_TESTNET,
  getBridgeChains,
  isStellarChain,
  isSolanaChain,
} from "@/lib/constants/networks";

type StellarTrustlineCheck = {
  address: string;
  status:
    | "idle"
    | "invalid"
    | "checking"
    | "ready"
    | "missing"
    | "account-missing"
    | "unavailable";
};

export default function HomePage() {
  const { toast } = useToast();
  useEffect(() => {
    const onError = (e: Event) =>
      toast({
        title: "Stellar wallet",
        description: String((e as CustomEvent).detail),
        variant: "destructive",
      });
    window.addEventListener("stellar-wallet-error", onError);
    return () => window.removeEventListener("stellar-wallet-error", onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rampNetworkForCountry = useTransactionStore(
    (state) => state.rampNetwork,
  );
  const storedRampCountry = useTransactionStore((state) => state.rampCountry);
  const setRampCountry = useTransactionStore((state) => state.setRampCountry);
  const country = effectiveCountry(rampNetworkForCountry, storedRampCountry);
  const { data: banks = [] } = useBanks(country.code);
  const offRamp = useOffRamp();
  const onRamp = useOnRamp();
  const initializeSwap = useInitializeSwap();
  const updateSwap = useUpdateSwapAfterExecution();
  const createSimpleSwap = useCreateSimpleSwap();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  // Always the latest function, for the retry below (the closure that scheduled it can be stale).
  const openConnectModalRef = useRef(openConnectModal);
  openConnectModalRef.current = openConnectModal;
  const { openAccountModal } = useAccountModal();
  const { disconnect: disconnectEvm } = useDisconnect();
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
    stellarConnectUri,
    cancelStellarConnect,
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
    if (!fromAmount || fromAmount <= 0)
      return { toAmount: "0", exchangeRate: 0 };
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
  const [stellarTrustlineCheck, setStellarTrustlineCheck] =
    useState<StellarTrustlineCheck>({ address: "", status: "idle" });
  const [stellarTrustlineRetry, setStellarTrustlineRetry] = useState(0);
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
  // Stellar relay sells take two taps (approve, then send). Holds the order reference that has been approved.
  const [stellarApprovedRef, setStellarApprovedRef] = useState<string | null>(
    null,
  );
  const [sentUsdcHash, setSentUsdcHash] = useState<string | null>(null);
  const [sendUsdcError, setSendUsdcError] = useState<string | null>(null);
  const [relayStage, setRelayStage] = useState<string | null>(null);
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
  // CNGN is not offered on Buy/Sell; coerce any persisted CNGN selection to USDC.
  useEffect(() => {
    if (activeTab !== "buy" && activeTab !== "sell") return;
    if (cryptoType === "CNGN") setCryptoType("USDC");
    if (buyReceiveType === "CNGN") setBuyReceiveType("USDC");
  }, [activeTab, cryptoType, buyReceiveType, setCryptoType, setBuyReceiveType]);

  // Buy tab: NGN -> USDC/USDT at Bitnob's onramp rate for the selected chain.
  const [buyRate, setBuyRate] = useState<number | null>(null);
  const [isBuyRateLoading, setIsBuyRateLoading] = useState(false);
  const [isLiquidityAvailable, setIsLiquidityAvailable] = useState(true);
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const config = useConfig();
  const chainId = useChainId();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const isUnsupportedNetwork =
    isConnected && !SUPPORTED_CHAINS.some((c) => c.id === chainId);
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
  const stellarDestinationAddress = walletAddress?.startsWith("G")
    ? walletAddress
    : stellarSourceAddress || stellarAddress || "";
  const stellarTrustlineReady =
    stellarTrustlineCheck.address === stellarDestinationAddress &&
    stellarTrustlineCheck.status === "ready";

  useEffect(() => {
    if (activeTab !== "bridge" || !isStellarChain(toChain)) {
      setStellarTrustlineCheck({ address: "", status: "idle" });
      return;
    }

    const address = stellarDestinationAddress;
    if (!/^G[A-Z2-7]{55}$/.test(address)) {
      setStellarTrustlineCheck({ address, status: "invalid" });
      return;
    }

    const controller = new AbortController();
    const horizonUrl = IS_TESTNET
      ? "https://horizon-testnet.stellar.org"
      : "https://horizon.stellar.org";
    const expectedIssuer =
      STELLAR_USDC_ISSUER[IS_TESTNET ? "testnet" : "mainnet"];
    setStellarTrustlineCheck({ address, status: "checking" });

    fetch(`${horizonUrl}/accounts/${encodeURIComponent(address)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 404) {
          setStellarTrustlineCheck({ address, status: "account-missing" });
          return;
        }
        if (!response.ok)
          throw new Error(`Horizon returned ${response.status}`);

        const account = (await response.json()) as {
          balances?: Array<{ asset_code?: string; asset_issuer?: string }>;
        };
        const hasUsdcTrustline = account.balances?.some(
          (balance) =>
            balance.asset_code === "USDC" &&
            balance.asset_issuer === expectedIssuer,
        );
        setStellarTrustlineCheck({
          address,
          status: hasUsdcTrustline ? "ready" : "missing",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Could not check Stellar USDC trustline:", error);
        setStellarTrustlineCheck({ address, status: "unavailable" });
      });

    return () => controller.abort();
  }, [activeTab, toChain, stellarDestinationAddress, stellarTrustlineRetry]);

  const parsedSellAmount = sellAmount ? parseFormattedNumber(sellAmount) : null;

  // Stellar sell: the connected wallet must hold the USDC (plus a margin for the transfer fee) and some XLM, or the
  // burn fails after the user has already approved. Check up front so they never get that far.
  const stellarSellGuardActive =
    activeTab === "sell" &&
    rampNetwork === "stellar" &&
    cryptoType === "USDC" &&
    isStellarConnected &&
    !!stellarAddress;
  const { data: stellarFunds } = useQuery({
    queryKey: ["stellar-funds", stellarAddress],
    queryFn: () => fetchStellarFunds(stellarAddress as string),
    enabled: stellarSellGuardActive,
    refetchInterval: 20_000,
  });
  const stellarSellShortfall = (() => {
    if (!stellarSellGuardActive || !stellarFunds) return null;
    if (!parsedSellAmount || parsedSellAmount <= 0) return null;
    const check = checkStellarFunds(
      stellarFunds,
      usdcNeededForSell(parsedSellAmount),
    );
    return check.ok ? null : check;
  })();
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
      swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase();
    const isTokenInUSDT =
      swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDT.toLowerCase();
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
        const { EIP712Domain: _removed, ...cleanTypes } = types as Record<
          string,
          unknown
        >;
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
      const gasEstimate = quote.transaction.gas
        ? safeBigInt(quote.transaction.gas)
        : undefined;
      const gasWithBuffer = gasEstimate
        ? (gasEstimate * 115n) / 100n
        : undefined;

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
  }, [
    address,
    swapData,
    chainId,
    config,
    writeContractAsync,
    signTypedDataAsync,
    executeSwap,
    toast,
  ]);

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

  // Sell: ask the server where the order is, every few seconds. The live WebSocket is not reachable in production,
  // and on its own it only ever reported "completed", so the screen used to sit unchanged whatever happened.
  const { data: sellDetail } = useQuery({
    queryKey: ["sell-status", reference],
    queryFn: async () =>
      (await stablestackApi.getOfframpDetail(reference as string)).data,
    enabled: activeTab === "sell" && step === "pending" && !!reference,
    refetchInterval: 5000,
    retry: false,
  });
  const sellProgressNow = sellProgress(
    sellDetail?.view?.status ?? sellDetail?.transaction?.status,
  );
  useEffect(() => {
    if (sellProgressNow?.phase === "done" && step === "pending") {
      setStep("completed");
      toast({
        title: "Payout sent",
        description: "Your money has been sent to your account.",
        variant: "success",
      });
    }
  }, [sellProgressNow?.phase, step, setStep, toast]);

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

  const handleCountrySelect = (code: RampCountryCode) => {
    if (code === country.code) return;
    setRampCountry(code);
    setAccountName(null);
    setAccountResolved(false);
    setAccountResolutionError(null);
  };

  const handleNetworkSelect = (net: "base" | "bsc" | "stellar") => {
    setRampNetwork(net);
    if (activeTab === "buy") {
      setBuyReceiveType("USDC");
    }
    if (activeTab === "sell" && isConnected && net !== "stellar") {
      const chainId =
        net === "bsc" ? (IS_TESTNET ? 97 : 56) : IS_TESTNET ? 84532 : 8453;
      switchChain?.({ chainId });
    }
  };

  const networkLabel =
    RAMP_NETWORKS.find((n) => n.id === rampNetwork)?.label ?? "Base";

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

  const handleFromCryptoSelect = (
    type: "CNGN" | "USDC" | "USDT" | "WETH" | "USDCX",
  ) => {
    setIsFromCryptoModalOpen(false);
    if (!isValidSwapPair(type, toCryptoType)) return;
    setFromCryptoType(type);
  };

  const handleToCryptoSelect = (
    type: "CNGN" | "USDC" | "USDT" | "WETH" | "USDCX",
  ) => {
    setIsToCryptoModalOpen(false);
    if (!isValidSwapPair(fromCryptoType, type)) return;
    setToCryptoType(type);
  };

  // Reactive login state for the UI (the function below is for click handlers). Nothing on the form works without
  // an account, so a logged-out visitor gets the login gate instead.
  const isLoggedIn = useIsAuthenticated();
  const authHydrated = useAuthStore((s) => s._hasHydrated);

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

  const selectedBank = banks.find((b) => b.institutionCode === bankCode);
  const selectedBankName = selectedBank?.institutionName;
  const isMobileMoney =
    selectedBank?.destinationType === "mobile_money" ||
    /m-?pesa|mobile/i.test(bankCode ?? "");

  useEffect(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Reset state if account number is incomplete for the country or not in sell tab
    if (
      activeTab !== "sell" ||
      !bankCode ||
      !isAccountNumberComplete(country, accountNumber)
    ) {
      if (!isAccountNumberComplete(country, accountNumber)) {
        setAccountName(null);
        setAccountResolved(false);
        setAccountResolutionError(null);
        lastResolvedRef.current = null;
      }
      return;
    }

    // Mobile money (M-Pesa and the like) has no account-name lookup, so there is nothing to validate: accept the
    // number as entered and show it back instead of waiting for a name that never comes.
    if (isMobileMoney) {
      setAccountName(
        `${selectedBankName ?? "Mobile money"} · ${accountNumber}`,
      );
      setAccountResolved(true);
      setAccountResolutionError(null);
      lastResolvedRef.current = null;
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
        isAccountNumberComplete(country, accountNumber) &&
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
            { bankCode, accountNumber, country: country.code },
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
  }, [
    accountNumber,
    bankCode,
    activeTab,
    resolveAccount.mutate,
    country,
    isMobileMoney,
    selectedBankName,
  ]);

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
      if (
        !shouldFetchQuote ||
        !quoteTokenIn ||
        !quoteTokenOut ||
        parsedQuoteAmount <= 0n
      ) {
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
          const { data } = await miscApi.getUsdNgnRate(undefined, {
            network: rampNetwork,
            direction: "offramp",
            country: country.code,
          });
          const rate = Number(data.rate);
          if (!Number.isFinite(rate) || rate <= 0 || !(usdAmount > 0))
            throw new Error("no rate");
          const out = parseUnits(
            (usdAmount * rate).toFixed(quoteDecimalsOut),
            quoteDecimalsOut,
          );
          setQuoteAmountOut(out);
          setPriceDataForQuote({
            buyAmount: out.toString(),
            source: data.source ?? "bitnob",
            rate,
          });
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
  }, [
    shouldFetchQuote,
    quoteTokenIn,
    quoteTokenOut,
    parsedQuoteAmount,
    address,
    sellAmount,
    quoteDecimalsOut,
    activeTab,
    fromCryptoType,
    toCryptoType,
    quoteDecimalsIn,
    isSellQuoteMode,
    rampNetwork,
    country.code,
  ]);

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
        const { data } = await miscApi.getUsdNgnRate(undefined, {
          network: rampNetwork,
          direction: "onramp",
          country: country.code,
        });
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
  }, [activeTab, buyReceiveType, buyAmount, rampNetwork, country.code]);

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

    if (stellarSellShortfall) {
      toast({
        title: "Not enough in your wallet",
        description: stellarSellShortfall.message,
        variant: "destructive",
      });
      return;
    }

    // Open confirmation modal
    setIsConfirmationModalOpen(true);
  };

  // Base/BSC off-ramp: the user signs an ERC-20 transfer of the exact quoted
  // amount to the Bitnob deposit address. Bitnob's webhook settles the payout.
  /**
   * Stellar off-ramp over CCTP + Base. The backend opened the payout on Base and gave us the exact burn to make;
   * the user just approves it in their wallet (no address is shown or typed). The backend relayer then mints the
   * USDC on Base, so no EVM wallet or gas is needed.
   */
  const stellarRelayGuard = () => {
    const data = transactionData?.data;
    const reference = data?.databaseRecord?.reference;
    if (!data?.bridge || !reference) return null;
    if (!isStellarConnected || !stellarAddress) {
      toast({
        title: "Wallet not connected",
        description: "Connect your Stellar wallet to continue",
        variant: "destructive",
      });
      return null;
    }
    if (
      data.deposit?.sourceAddress &&
      data.deposit.sourceAddress !== stellarAddress
    ) {
      const msg = "Connect the Stellar wallet you started this order with.";
      setSendUsdcError(msg);
      toast({
        title: "Wrong wallet",
        description: msg,
        variant: "destructive",
      });
      return null;
    }
    return { data, reference, address: stellarAddress };
  };

  /** Tap 1: approve the USDC allowance in the wallet. */
  const handleApproveStellarRelay = async () => {
    const g = stellarRelayGuard();
    if (!g) return;
    try {
      setIsSendingUsdc(true);
      setSendUsdcError(null);
      setRelayStage("Approve the USDC allowance in your wallet…");
      await approveStellarOfframp({
        stellarAddress: g.address,
        bridge: g.data.bridge,
        signXdr: signStellarTransaction,
      });
      setStellarApprovedRef(g.reference);
      setRelayStage("Approved. Now tap “Send USDC” to finish.");
    } catch (err) {
      setRelayStage(null);
      const msg = err instanceof Error ? err.message : "Approval failed";
      setSendUsdcError(msg);
      toast({
        title: "Approval failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSendingUsdc(false);
    }
  };

  /** Tap 2: the burn, then record it and wait for the relay. */
  const handleSendStellarRelay = async () => {
    const data = transactionData?.data;
    const reference = data?.databaseRecord?.reference;
    if (!data?.bridge || !reference) return;
    if (!isStellarConnected || !stellarAddress) {
      toast({
        title: "Wallet not connected",
        description: "Connect your Stellar wallet to continue",
        variant: "destructive",
      });
      return;
    }
    if (
      data.deposit?.sourceAddress &&
      data.deposit.sourceAddress !== stellarAddress
    ) {
      const msg = "Connect the Stellar wallet you started this order with.";
      setSendUsdcError(msg);
      toast({
        title: "Wrong wallet",
        description: msg,
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSendingUsdc(true);
      setSendUsdcError(null);
      setRelayStage("Confirm the transfer in your wallet…");
      let burnHash: string;
      try {
        burnHash = await burnForStellarOfframp({
          stellarAddress,
          bridge: data.bridge,
          signXdr: signStellarTransaction,
        });
      } catch (burnError) {
        // The approval may have expired or been spent: let them approve again.
        setStellarApprovedRef(null);
        throw burnError;
      }
      setSentUsdcHash(burnHash);

      // The server needs the burn hash to complete the transfer; retry briefly before giving up.
      setRelayStage("Recording your transfer…");
      let confirmed = false;
      for (let attempt = 0; attempt < 4 && !confirmed; attempt++) {
        try {
          await stablestackApi.confirmOfframp(reference, burnHash);
          confirmed = true;
        } catch {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (!confirmed) {
        throw new Error(
          `Your USDC was sent (${burnHash}) but we couldn't record it yet. Use "I've made the transfer" in a minute.`,
        );
      }

      await waitForRelay(
        reference,
        async (ref) => (await stablestackApi.relayOfframp(ref)).data,
        {
          onState: (state) =>
            setRelayStage(
              state === "attesting"
                ? "Waiting for Circle to confirm your transfer…"
                : state === "minting"
                  ? "Delivering your USDC…"
                  : "Almost done…",
            ),
        },
      );
      setRelayStage(null);
      toast({
        title: "Transfer complete",
        description: "Your USDC has been received. Your payout is on its way.",
        variant: "success",
      });
    } catch (err) {
      setRelayStage(null);
      const msg = err instanceof Error ? err.message : "Failed to send USDC";
      setSendUsdcError(msg);
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    } finally {
      setIsSendingUsdc(false);
    }
  };

  const handleSendEvmUsdc = async () => {
    const deposit = transactionData?.data?.deposit;
    if (!deposit?.receiveAddress) return;
    if (!isConnected || !address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to continue",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSendingUsdc(true);
      setSendUsdcError(null);

      const isBsc = rampNetwork === "bsc";
      const requiredChainId = isBsc ? (IS_TESTNET ? 97 : 56) : targetChain;
      // A stale WalletConnect session looks "connected" but never receives the request, so the
      // wallet never opens. Time the wallet steps out so the button recovers with a clear hint.
      const withWalletTimeout = <T,>(
        p: Promise<T>,
        label: string,
      ): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(
            () =>
              reject(
                new Error(
                  `${label} didn't open in your wallet. Open your wallet app and check for a pending request, or disconnect and reconnect your wallet, then try again.`,
                ),
              ),
            45_000,
          );
          p.then(
            (v) => {
              clearTimeout(t);
              resolve(v);
            },
            (e) => {
              clearTimeout(t);
              reject(e);
            },
          );
        });

      if (chainId !== requiredChainId) {
        await withWalletTimeout(
          switchChainAsync({ chainId: requiredChainId }),
          "The network switch request",
        );
      }

      const token = cryptoType === "USDT" ? "USDT" : "USDC";
      const tokenAddress = (isBsc ? BSC_CONSTANTS : SWAP_CONSTANTS)[token];
      const decimals = (isBsc ? BSC_CONSTANTS : SWAP_CONSTANTS)[
        `${token}_DECIMALS` as const
      ];

      const hash = await withWalletTimeout(
        writeContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: [
            {
              inputs: [
                { internalType: "address", name: "to", type: "address" },
                { internalType: "uint256", name: "amount", type: "uint256" },
              ],
              name: "transfer",
              outputs: [{ internalType: "bool", name: "", type: "bool" }],
              stateMutability: "nonpayable",
              type: "function",
            },
          ] as const,
          functionName: "transfer",
          args: [
            deposit.receiveAddress as `0x${string}`,
            parseUnits(String(deposit.amount || sellAmount), decimals),
          ],
          chainId: requiredChainId,
        }),
        "The transaction request",
      );
      setSentUsdcHash(hash);

      const ref = transactionData?.data?.databaseRecord?.reference;
      if (ref) {
        // Best-effort; the Bitnob payout webhook is the authoritative signal.
        await stablestackApi.confirmOfframp(ref, hash).catch(() => {});
      }
      toast({ title: "USDC sent", description: hash, variant: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send USDC";
      setSendUsdcError(msg);
      toast({
        title: "Send failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSendingUsdc(false);
    }
  };

  const handleConfirmSell = () => {
    const parsedAmount = parseFormattedNumber(sellAmount);

    // We already validated inputs in handleSell, so we can proceed with execution

    if (cryptoType === "USDC" || cryptoType === "USDT") {
      // Stellar, Base and BSC all cash out through the Bitnob off-ramp: the user
      // sends USDC straight to the returned deposit address (no cNGN swap).
      {
        const effectiveStellarSource =
          rampNetwork === "stellar"
            ? stellarSourceAddress ||
              stellarAddress ||
              (typeof window !== "undefined"
                ? localStorage.getItem("stellar-wallet-address") || ""
                : "")
            : address || "";
        if (!effectiveStellarSource) {
          setIsConfirmationModalOpen(false);
          toast({
            title: "Wallet not connected",
            description: "Please connect your wallet to continue",
            variant: "destructive",
          });
          return;
        }
        // The order API takes a NAIRA amount (min ₦2,000); the form collects USDC, so convert at the live rate.
        const usdcAmount = Number(
          parseFloat(sellAmount.replace(/,/g, "")).toFixed(6),
        );
        void (async () => {
          let rate: number | null = null;
          try {
            rate = (
              await miscApi.getUsdNgnRate(undefined, {
                network: rampNetwork,
                direction: "offramp",
                country: country.code,
              })
            ).data.rate;
          } catch {
            rate = null;
          }
          const result = rate ? ngnAmountForUsdc(usdcAmount, rate) : null;
          if (!result || !result.ok) {
            setIsConfirmationModalOpen(false);
            toast({
              title: !result ? "Rate unavailable" : "Invalid amount",
              description: !result
                ? `We couldn't get the current USDC/${country.currency} rate. Please try again in a moment.`
                : "Enter a valid USDC amount.",
              variant: "destructive",
            });
            return;
          }
          offRamp.mutate(
            {
              network: rampNetwork,
              amount: result.ngn,
              ...(country.code !== "NG" ? { country: country.code } : {}),
              // Stellar off-ramps are built for the network the user toggled to.
              ...(rampNetwork === "stellar"
                ? {
                    chainNetwork: IS_TESTNET
                      ? ("testnet" as const)
                      : ("mainnet" as const),
                  }
                : {}),
              destination: { bankCode, accountNumber },
              sourceAddress: effectiveStellarSource,
            },
            {
              onSuccess: (response) => {
                setTransactionData(normalizeRampResponse(response.data));
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
      if (
        stellarTrustlineCheck.address !== recipientAddress ||
        stellarTrustlineCheck.status !== "ready"
      ) {
        toast({
          title: "Stellar USDC trustline required",
          description:
            stellarTrustlineCheck.status === "unavailable"
              ? "We couldn't verify this address's USDC trustline. Retry the check before bridging."
              : "This Stellar address must have a USDC trustline before it can receive the bridge.",
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
          stellarSigner: isStellarConnected
            ? signStellarTransaction
            : undefined,
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

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount < (country.code === "NG" ? 100 : country.minAmount)
    ) {
      toast({
        title: "Invalid amount",
        description: `Minimum amount is ${country.minAmount.toLocaleString("en-US")} ${country.currency}`,
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
        ...(country.code !== "NG" ? { country: country.code } : {}),
        destination: { address: walletAddress },
      },
      {
        onSuccess: (response) => {
          setTransactionData(normalizeRampResponse(response.data));
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
    const amountInAtomic = parseUnits(
      sellAmount.replace(/,/g, ""),
      tokenInDecimals,
    );

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
      // Buying (on-ramp) is switched off for now, on every network.
      return;
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
  // Wallets this screen can use. The hub connects the one that is still missing; optional ones are offered quietly.
  const bridgeFromStellar = activeTab === "bridge" && isStellarChain(fromChain);
  const bridgeFromSolana = activeTab === "bridge" && isSolanaChain(fromChain);
  const walletEntries: WalletEntry[] = [
    {
      id: "evm",
      name: "wallet",
      title: "EVM wallet",
      chain: "EVM",
      relevant:
        rampNetwork !== "stellar" && !bridgeFromStellar && !bridgeFromSolana,
      required: true,
      connected: isConnected,
      address,
      onConnect: () => {
        if (openConnectModal) return openConnectModal();
        // RainbowKit only offers the modal while the wallet is "disconnected". A connection stuck in
        // connecting/reconnecting (an unanswered wallet prompt, an interrupted connect) leaves it undefined and the
        // click would do nothing. Clear that state, then open the modal.
        disconnectEvm();
        setTimeout(() => {
          if (openConnectModalRef.current) openConnectModalRef.current();
          else
            toast({
              title: "Wallet",
              description:
                "Couldn't open the wallet list. Reload the page and try again.",
              variant: "destructive",
            });
        }, 300);
      },
      onManage: () => openAccountModal?.(),
      onDisconnect: () => disconnectEvm(),
    },
    {
      id: "stellar",
      name: "Stellar",
      title: "Stellar wallet",
      chain: "Stellar",
      hint: bridgeFromStellar
        ? "Required to bridge from Stellar"
        : activeTab === "bridge"
          ? "Optional: you can also paste a destination address"
          : "Scan with a WalletConnect wallet, e.g. Lobstr or Varial",
      relevant:
        rampNetwork === "stellar" ||
        (activeTab === "bridge" &&
          (isStellarChain(fromChain) || isStellarChain(toChain))),
      required: rampNetwork === "stellar" || bridgeFromStellar,
      connected: isStellarConnected,
      connecting: isStellarConnecting,
      address: stellarAddress,
      onConnect: () => connectStellar(),
      onDisconnect: () => disconnectStellar(),
    },
    {
      id: "solana",
      name: "Solana",
      title: "Solana wallet",
      chain: "Solana",
      hint: bridgeFromSolana
        ? "Required to bridge from Solana"
        : "Optional: Phantom or Solflare",
      relevant:
        activeTab === "bridge" &&
        (isSolanaChain(fromChain) || isSolanaChain(toChain)),
      required: bridgeFromSolana,
      connected: isSolanaConnected,
      connecting: isSolanaConnecting,
      address: solanaAddress,
      onConnect: () =>
        connectSolana().catch((err: Error) =>
          toast({
            title: "Solana wallet",
            description: err.message,
            variant: "destructive",
          }),
        ),
      onDisconnect: () => disconnectSolana(),
    },
    {
      id: "stacks",
      name: "Stacks",
      title: "Stacks wallet",
      chain: "Stacks",
      hint: "For USDCx (Leather / Xverse)",
      relevant: activeTab === "swap",
      required: false,
      connected: isStacksConnected,
      connecting: isStacksConnecting,
      address: stacksAddress,
      onConnect: () => connectStacks(),
      onDisconnect: () => disconnectStacks(),
    },
  ];

  const renderContent = () => {
    if (step === "form") {
      return (
        <div className="ramp-panel space-y-4">
          {/* Network Warning */}
          {isUnsupportedNetwork && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-4 mb-2 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-red-500 font-medium">
                <LucideAlertTriangle className="h-5 w-5" />
                <span>Unsupported Network</span>
              </div>
              <p className="text-gray-400 text-xs text-center px-4">
                You are connected to an unsupported network. Please switch to{" "}
                {targetChainName} to continue.
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

          {activeTab === "swap" &&
            !isLiquidityAvailable &&
            parsedQuoteAmount > 0n && (
              <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-2xl p-4 mb-2 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-yellow-500 font-medium">
                  <LucideAlertTriangle className="h-5 w-5" />
                  <span>Insufficient Liquidity</span>
                </div>
                <p className="text-gray-400 text-xs text-center px-4">
                  We couldn't find enough liquidity for this swap on{" "}
                  {targetChainName}. Try a smaller amount or a different token
                  pair.
                </p>
              </div>
            )}
          <div
            className="ramp-seg mb-5 flex-nowrap"
            role="group"
            aria-label="What do you want to do?"
          >
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

          {!authHydrated ? (
            <div
              className="ramp-field h-72 animate-pulse"
              aria-hidden
              data-testid="login-gate-loading"
            />
          ) : !isLoggedIn ? (
            <LoginGate
              tab={activeTab}
              onLogin={() => setIsAuthModalOpen(true)}
            />
          ) : (
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
                      aria-label="Swap direction"
                      className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-(--r-line) bg-(--r-raised) text-(--r-text) shadow-lg transition-colors hover:border-(--r-signal)"
                      onClick={() => {
                        const temp = fromChain;
                        setFromChain(toChain);
                        setToChain(temp);
                      }}
                    >
                      <ArrowUpDown size={18} />
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
                  {isStellarChain(toChain) && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`-mt-2 px-1 text-xs ${
                        stellarTrustlineCheck.status === "ready"
                          ? "text-emerald-400"
                          : stellarTrustlineCheck.status === "missing" ||
                              stellarTrustlineCheck.status ===
                                "account-missing" ||
                              stellarTrustlineCheck.status === "unavailable"
                            ? "text-amber-300"
                            : "text-white/60"
                      }`}
                    >
                      {stellarTrustlineCheck.status === "checking" &&
                        "Checking destination USDC trustline…"}
                      {stellarTrustlineCheck.status === "ready" &&
                        "Destination USDC trustline verified."}
                      {stellarTrustlineCheck.status === "invalid" &&
                        "Connect a Stellar wallet or enter a valid G… destination address."}
                      {stellarTrustlineCheck.status === "account-missing" &&
                        "This Stellar account was not found on the selected network. Create and fund it before bridging."}
                      {stellarTrustlineCheck.status === "missing" && (
                        <span>
                          This destination cannot receive USDC yet. Add a
                          Stellar USDC trustline for issuer{" "}
                          <code className="break-all">
                            {
                              STELLAR_USDC_ISSUER[
                                IS_TESTNET ? "testnet" : "mainnet"
                              ]
                            }
                          </code>
                          .
                        </span>
                      )}
                      {stellarTrustlineCheck.status === "unavailable" && (
                        <span>
                          Couldn’t verify the USDC trustline. The bridge stays
                          disabled until it can be checked.{" "}
                          <button
                            type="button"
                            className="underline underline-offset-2"
                            onClick={() =>
                              setStellarTrustlineRetry((n) => n + 1)
                            }
                          >
                            Retry check
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <SwapSection
                    label="You'll send"
                    amount={activeTab === "buy" ? buyAmount : sellAmount}
                    onAmountChange={
                      activeTab === "buy"
                        ? handleBuyAmountChange
                        : handleSellAmountChange
                    }
                    currencyType={
                      activeTab === "buy"
                        ? (country.currency as "NGN" | "GHS" | "KES")
                        : activeTab === "swap"
                          ? (fromCryptoType as "CNGN" | "USDC")
                          : (cryptoType as "CNGN" | "USDC" | "USDT")
                    }
                    onCurrencyClick={
                      activeTab === "buy"
                        ? () => setIsCryptoModalOpen(true)
                        : activeTab === "swap"
                          ? () => setIsFromCryptoModalOpen(true)
                          : () => setIsCryptoModalOpen(true)
                    }
                    currencyDetail={
                      activeTab === "sell" ? networkLabel : undefined
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
                              if (
                                !isValidSwapPair(toCryptoType, fromCryptoType)
                              ) {
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
                      aria-label={
                        activeTab === "swap"
                          ? "Swap direction"
                          : "Pay, then receive"
                      }
                      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-(--r-line) bg-(--r-raised) text-(--r-text) shadow-lg transition-colors hover:border-(--r-signal) ${
                        activeTab === "swap" &&
                        !isValidSwapPair(toCryptoType, fromCryptoType)
                          ? "opacity-40 cursor-not-allowed"
                          : ""
                      }`}
                    >
                      {activeTab === "buy" || activeTab === "sell" ? (
                        <ArrowDown size={18} />
                      ) : (
                        <ArrowUpDown size={18} />
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
                              const usdc = parsed / buyRate;
                              // Small amounts (e.g. ₦2 ≈ 0.0014 USDC) must not round to "0.00".
                              return usdc.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: usdc < 1 ? 6 : 2,
                              });
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
                          : (country.currency as "NGN" | "GHS" | "KES")
                    }
                    onCurrencyClick={
                      activeTab === "buy"
                        ? () => setIsCryptoModalOpen(true)
                        : activeTab === "swap"
                          ? () => setIsToCryptoModalOpen(true)
                          : () => setIsCryptoModalOpen(true)
                    }
                    currencyDetail={
                      activeTab === "buy" ? networkLabel : undefined
                    }
                    disabled={true}
                    isLoading={activeTab === "swap" && isQuoteLoading}
                    footer={
                      activeTab === "buy" &&
                      buyReceiveType === "USDC" &&
                      buyAmount ? (
                        <div className="flex items-center justify-between text-xs">
                          <span>Rate</span>
                          <span className="ramp-amount text-(--r-text)">
                            {buyRate
                              ? `1 ${buyReceiveType} = ${country.symbol}${buyRate.toLocaleString(country.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : isBuyRateLoading
                                ? "fetching…"
                                : "rate unavailable"}
                          </span>
                        </div>
                      ) : activeTab === "swap" && priceDataForQuote ? (
                        <div className="flex flex-col gap-1 text-[10px]">
                          <div className="flex justify-between items-center">
                            <span className="text-white/40">
                              Indicative Rate:
                            </span>
                            <span className="text-white/60 font-medium">
                              1 {fromCryptoType} ={" "}
                              {exchangeRate.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 6,
                              })}{" "}
                              {toCryptoType}
                            </span>
                          </div>
                        </div>
                      ) : undefined
                    }
                  />

                  {activeTab === "swap" && !showQuote && (
                    <div className="space-y-4">
                      {/* Warn when USDT is used — USDC has better liquidity for CNGN */}
                      {fromCryptoType === "USDT" && toCryptoType === "CNGN" && (
                        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                          <LucideAlertTriangle className="text-yellow-400 w-4 h-4 flex-shrink-0 mt-0.5" />
                          <p className="text-yellow-300/80 text-xs">
                            USDT → CNGN has limited liquidity. For best results,
                            use <strong>USDC</strong> instead — it has a direct
                            pool with CNGN. Minimum recommended:{" "}
                            <strong>1 USDT</strong>.
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
                            toast({
                              title: "Amount too low",
                              description: "Minimum swap amount is 100 CNGN",
                              variant: "destructive",
                            });
                            return;
                          }
                          if (fromCryptoType === "USDT" && parsed < 1) {
                            toast({
                              title: "Amount too low",
                              description:
                                "Minimum swap amount for USDT is 1 USDT. Use USDC for smaller amounts.",
                              variant: "destructive",
                            });
                            return;
                          }
                          if (
                            toCryptoType === "CNGN" &&
                            quoteAmountOut <
                              parseUnits("100", SWAP_CONSTANTS.CNGN_DECIMALS)
                          ) {
                            toast({
                              title: "Amount too low",
                              description:
                                "Minimum received amount is 100 CNGN",
                              variant: "destructive",
                            });
                            return;
                          }
                          setShowQuote(true);
                        }}
                        disabled={
                          isQuoteLoading ||
                          !priceDataForQuote ||
                          !isLiquidityAvailable ||
                          !isConnected
                        }
                        className="ramp-cta"
                      >
                        Review trade
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
                        direction={
                          fromCryptoType === "USDCX" ? "redeem" : "deposit"
                        }
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
                            fromAmount: parseFloat(
                              sellAmount.replace(/,/g, ""),
                            ),
                            toAmount: parseFloat(buyAmount),
                            exchangeRate:
                              parseFloat(buyAmount) /
                              parseFloat(sellAmount.replace(/,/g, "")),
                            sourceAddress: address!,
                            destinationAddress: walletAddress || address!,
                            network: "base",
                            slippage: 0.05,
                          },
                          {
                            onSuccess: (response) => {
                              updateSwap.mutate({
                                reference: response.data.reference,
                                data: {
                                  transactionHash: hash,
                                  sourceAddress: address!,
                                },
                              });
                            },
                          },
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
                    <label
                      className="ramp-label mb-2 block"
                      htmlFor="destination-wallet"
                    >
                      {activeTab === "bridge"
                        ? "Destination wallet"
                        : `Wallet to receive ${activeTab === "swap" ? toCryptoType : buyReceiveType}`}
                    </label>
                    <Input
                      id="destination-wallet"
                      type="text"
                      placeholder={
                        activeTab === "bridge" && isStellarChain(toChain)
                          ? "G… Stellar address"
                          : activeTab === "bridge" && isSolanaChain(toChain)
                            ? "Solana address"
                            : "0x… address"
                      }
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      className="ramp-field h-14 px-4 font-mono text-sm text-(--r-text) placeholder:text-(--r-muted)/60 outline-0 focus:ring-0 focus:outline-0"
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
                  <div className="ramp-field grid grid-cols-6 gap-2 p-2">
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
                          if (value.length <= country.accountMax) {
                            setAccountNumber(value);
                          }
                        }}
                        maxLength={country.accountMax}
                        className="w-full h-14 rounded-lg bg-white/5 text-white placeholder:text-white/30 border-0 outline-0 focus:ring-0 focus:outline-0 focus:border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  {/* Account Resolution Status */}
                  {isAccountNumberComplete(country, accountNumber) &&
                    bankCode && (
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
                        ) : isAccountNumberComplete(country, accountNumber) &&
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
                <div className="space-y-3">
                  <WalletHub entries={walletEntries} />
                  {isConnected &&
                    usdcBalance !== undefined &&
                    cngnBalance !== undefined && (
                      <div className="ramp-field p-4">
                        <div className="flex items-center justify-between">
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
                      </div>
                    )}
                </div>
              ) : null}

              {activeTab === "sell" && stellarSellShortfall && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                >
                  {stellarSellShortfall.message}
                </p>
              )}

              {activeTab !== "swap" && (
                <Button
                  type="submit"
                  className="ramp-cta"
                  disabled={
                    activeTab === "buy" ||
                    (activeTab === "bridge" &&
                      isStellarChain(toChain) &&
                      !stellarTrustlineReady) ||
                    (activeTab === "sell" &&
                      (!accountResolved ||
                        !accountName ||
                        resolveAccount.isPending ||
                        !!stellarSellShortfall))
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
                    ? "Buy coming soon"
                    : activeTab === "sell"
                      ? `Sell ${cryptoType}`
                      : "Bridge"}
                </Button>
              )}
            </form>
          )}
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
                {swapReceiptError?.message ||
                  "The swap transaction was rejected on-chain."}
              </p>
              <code className="text-xs text-white/40 break-all">
                {swapHash}
              </code>
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
      const waitingOnWallet = isSendingUsdc || !!relayStage;
      const usdcSent = !!sentUsdcHash && !waitingOnWallet;
      const pendingTitle =
        activeTab === "buy"
          ? "Waiting for your transfer"
          : activeTab === "sell"
            ? usdcSent
              ? "Transfer sent"
              : "Send your USDC"
            : activeTab === "bridge"
              ? "Bridging your USDC"
              : "Processing";
      const pendingSubtitle =
        activeTab === "buy"
          ? `Send ${country.symbol}${buyAmount} from your bank app to the account below. We detect it automatically and send your USDC.`
          : activeTab === "sell"
            ? usdcSent
              ? "Waiting for the network to confirm. Your bank payout starts as soon as it does."
              : "Send the amount shown. Your bank payout starts when we receive it."
            : activeTab === "bridge"
              ? "This can take up to 20 minutes. You can close this page and it will finish on its own."
              : "Your transaction is being processed.";
      // Once the server reports progress (or a problem), say so instead of the "send your USDC" wording.
      const liveSell = activeTab === "sell" ? sellProgressNow : null;
      return (
        <div className="ramp-panel space-y-4">
          <StatusHeader
            state={liveSell?.phase === "failed" ? "failed" : "waiting"}
            title={liveSell?.title ?? pendingTitle}
            subtitle={liveSell?.subtitle ?? pendingSubtitle}
          />

          {(reference || (activeTab === "bridge" && bridgeRef)) && (
            <ReferenceCard
              reference={(reference || bridgeRef) as string}
              live={wsConnected}
            />
          )}

          {activeTab === "bridge" && (
            <div className="space-y-4">
              {/* Source Transaction */}
              <div className="ramp-field p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-(--r-muted) text-sm">
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
                      className="text-(--r-signal) text-xs hover:underline flex items-center gap-1"
                    >
                      View on Explorer <ArrowUpRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {bridgeResult?.sourceTxHash ||
                bridgeStatus?.metadata?.SOURCE_TX ? (
                  <code className="text-xs text-(--r-signal) block truncate bg-(--r-raised) p-2 rounded">
                    {bridgeResult?.sourceTxHash ||
                      bridgeStatus?.metadata?.SOURCE_TX}
                  </code>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-(--r-muted)">
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
                <div className="ramp-field p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-(--r-muted) text-sm">
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
                      className="text-(--r-signal) text-xs hover:underline flex items-center gap-1"
                    >
                      View on Explorer <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                  <code className="text-xs text-(--r-signal) block truncate bg-(--r-raised) p-2 rounded">
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
                    <p className="text-sm font-medium text-(--r-text)">
                      Bridge Initiated
                    </p>
                    <p className="text-xs text-(--r-muted)">
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
                    <p className="text-sm font-medium text-(--r-text)">
                      Circle Attestation
                    </p>
                    <p className="text-xs text-(--r-muted)">
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
                    <p className="text-sm font-medium text-(--r-text)">
                      Destination Mint
                    </p>
                    <p className="text-xs text-(--r-muted)">
                      Funds sent to your wallet
                    </p>
                  </div>
                </div>
              </div>

              <div className="ramp-field p-3">
                <p className="text-xs text-(--r-muted)">
                  <span className="font-bold">Note:</span> Bridging uses Circle
                  CCTP which requires block finality — this can take up to ~20
                  minutes. You can safely close this window; the transaction
                  will complete automatically.
                </p>
              </div>
            </div>
          )}

          {activeTab === "buy" && transactionData?.data?.depositAccount && (
            <>
              <AmountCard
                label="Amount to pay"
                amount={`${country.symbol}${buyAmount}`}
              />
              <DetailCard>
                <DetailRow
                  label="Bank"
                  value={depositBankName(transactionData.data.depositAccount)}
                />
                <DetailRow
                  label="Account number"
                  value={String(
                    transactionData.data.depositAccount.accountNumber,
                  )}
                  mono
                  copy={{
                    label: "Copy account number",
                    toastText: "Account number copied",
                  }}
                />
                <DetailRow
                  label="Account name"
                  value={String(
                    transactionData.data.depositAccount.accountName ?? "",
                  )}
                />
              </DetailCard>
            </>
          )}

          {/* {activeTab === "sell" &&
            cryptoType === "CNGN" &&
            transactionData?.data?.depositAddress && (
              <div className="ramp-field p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="text-(--r-muted)" size={20} />
                  <span className="text-(--r-muted) font-semibold">
                    Deposit Address
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-(--r-text) flex-1 break-all">
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
                    className="rounded p-1 text-(--r-muted) hover:bg-(--r-raised) hover:text-(--r-text)"
                  >
                    {copied ? (
                      <CheckCircle size={16} className="text-(--r-signal)" />
                    ) : (
                      <Copy size={16} className="text-(--r-muted)" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-(--r-muted) mt-2">
                  Send your crypto to this address
                </p>
              </div>
            )} */}
          {activeTab === "sell" &&
            cryptoType === "CNGN" &&
            transactionData?.data?.depositAddress && (
              <div className="ramp-field p-4 space-y-4">
                {/* 1. Amount Section */}
                <div>
                  <span className="ramp-label mb-1 block">Amount to send</span>
                  <p className="text-2xl font-bold text-(--r-text) tracking-tight">
                    {sellAmount}{" "}
                    <span className="text-lg font-medium text-(--r-muted)">
                      CNGN
                    </span>
                  </p>
                </div>

                {/* Divider */}
                <div className="h-px w-full bg-(--r-line)" />

                {/* 2. Address Section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="text-(--r-muted)" size={16} />
                    <span className="ramp-label">Deposit Address</span>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-(--r-line) bg-(--r-panel) p-2">
                    <code className="text-xs text-(--r-text) flex-1 break-all font-mono">
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
                      className="rounded-md p-2 text-(--r-muted) transition-colors hover:bg-(--r-raised) hover:text-(--r-text)"
                    >
                      {copied ? (
                        <CheckCircle size={16} className="text-(--r-signal)" />
                      ) : (
                        <Copy size={16} className="text-(--r-muted)" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-(--r-muted) mt-2">
                    Please send exactly <strong>{sellAmount} CNGN</strong> to
                    the address above.
                  </p>
                </div>
              </div>
            )}

          {activeTab === "sell" &&
            (cryptoType === "USDC" || cryptoType === "USDT") &&
            (transactionData?.data?.deposit?.receiveAddress ||
              transactionData?.data?.deposit?.mode === "cctp_relay") && (
              <div className="ramp-field p-4 space-y-4">
                <div>
                  <span className="ramp-label mb-1 block">Amount to send</span>
                  <p className="text-2xl font-bold text-(--r-text) tracking-tight">
                    {transactionData.data.deposit.amount || sellAmount}{" "}
                    <span className="text-lg font-medium text-(--r-muted)">
                      {cryptoType}
                    </span>
                  </p>
                </div>

                <div className="h-px w-full bg-(--r-line)" />

                <div>
                  {transactionData.data.deposit.mode !== "cctp_relay" && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="text-(--r-muted)" size={16} />
                        <span className="ramp-label">Deposit address</span>
                      </div>

                      <div className="flex items-center gap-2 rounded-lg border border-(--r-line) bg-(--r-panel) p-2">
                        <code className="text-xs text-(--r-text) flex-1 break-all font-mono">
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
                          className="rounded-md p-2 text-(--r-muted) transition-colors hover:bg-(--r-raised) hover:text-(--r-text)"
                        >
                          {copied ? (
                            <CheckCircle
                              size={16}
                              className="text-(--r-signal)"
                            />
                          ) : (
                            <Copy size={16} className="text-(--r-muted)" />
                          )}
                        </button>
                      </div>

                      {transactionData.data.deposit.memo && (
                        <p className="text-xs text-(--r-muted) mt-2">
                          Memo:{" "}
                          <strong>{transactionData.data.deposit.memo}</strong>
                        </p>
                      )}

                      {transactionData.data.deposit.validUntil && (
                        <p className="text-xs text-(--r-muted) mt-2">
                          Valid until:{" "}
                          {new Date(
                            transactionData.data.deposit.validUntil,
                          ).toLocaleString()}
                        </p>
                      )}
                    </>
                  )}

                  <div className="pt-3">
                    {usdcSent ? (
                      <SellProgressTrack
                        status={
                          sellDetail?.view?.status ??
                          sellDetail?.transaction?.status
                        }
                      />
                    ) : (
                      <Button
                        type="button"
                        onClick={
                          transactionData.data.deposit.mode === "cctp_relay"
                            ? stellarApprovedRef ===
                              transactionData.data.databaseRecord?.reference
                              ? handleSendStellarRelay
                              : handleApproveStellarRelay
                            : rampNetwork !== "stellar"
                              ? handleSendEvmUsdc
                              : async () => {
                                  try {
                                    setIsSendingUsdc(true);
                                    setSendUsdcError(null);
                                    const hash = await sendUsdc({
                                      destination:
                                        transactionData.data.deposit
                                          .receiveAddress,
                                      amount: String(
                                        transactionData.data.deposit.amount ||
                                          sellAmount,
                                      ),
                                      memo:
                                        transactionData.data.deposit.memo ||
                                        null,
                                      assetCode:
                                        transactionData.data.deposit
                                          .assetCode || null,
                                      assetIssuer:
                                        transactionData.data.deposit
                                          .assetIssuer || null,
                                    });
                                    setSentUsdcHash(hash);
                                    const ref =
                                      transactionData.data.databaseRecord
                                        ?.reference;
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
                                }
                        }
                        disabled={
                          (rampNetwork === "stellar"
                            ? !isStellarConnected
                            : !isConnected) || isSendingUsdc
                        }
                        className="ramp-cta"
                      >
                        {isSendingUsdc ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : transactionData.data.deposit.mode ===
                          "cctp_relay" ? (
                          stellarApprovedRef ===
                          transactionData.data.databaseRecord?.reference ? (
                            "Step 2 of 2: Send USDC"
                          ) : (
                            "Step 1 of 2: Approve USDC"
                          )
                        ) : (
                          "Send USDC from wallet"
                        )}
                      </Button>
                    )}

                    {!usdcSent &&
                      transactionData.data.deposit.mode === "cctp_relay" && (
                        <p className="text-xs text-(--r-muted) mt-2">
                          Two steps, one tap each: first approve, then send.
                          After each tap, switch to your wallet app to confirm.
                        </p>
                      )}

                    {rampNetwork === "stellar" && !isStellarConnected && (
                      <p className="text-xs text-(--r-muted) mt-2">
                        Connect your Stellar wallet to send USDC automatically.
                      </p>
                    )}
                    {rampNetwork !== "stellar" && !isConnected && (
                      <p className="text-xs text-(--r-muted) mt-2">
                        Connect your wallet to send USDC automatically.
                      </p>
                    )}

                    {sentUsdcHash && (
                      <p className="text-xs text-(--r-signal) mt-2 break-all font-mono">
                        Tx:{" "}
                        <a
                          href={
                            rampNetwork === "stellar"
                              ? `https://stellar.expert/explorer/testnet/tx/${sentUsdcHash}`
                              : (explorerTxUrl(
                                  `${rampNetwork}${IS_TESTNET ? " testnet" : ""}`,
                                  sentUsdcHash,
                                ) ?? "#")
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-green-300"
                        >
                          {sentUsdcHash}
                        </a>
                      </p>
                    )}

                    {relayStage && (
                      <p className="text-xs text-amber-300 mt-2">
                        {relayStage}
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
        <div className="ramp-panel space-y-4">
          <StatusHeader
            state="done"
            title="All done"
            subtitle={
              activeTab === "sell"
                ? "Your payout has been sent to your account."
                : "Your transaction has been completed."
            }
          />

          {reference && <ReferenceCard reference={reference} />}

          <button type="button" className="ramp-cta" onClick={handleResetForm}>
            New transaction
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="bg-background overflow-x-hidden">
      <Header onOpenAuthModal={() => setIsAuthModalOpen(true)} />
      <section className="ramp relative min-h-screen pt-28 pb-20 px-4 sm:px-6 overflow-hidden">
        <RampBackdrop />

        <div className="relative z-10 mx-auto w-full max-w-2xl">
          <div className="mx-auto mb-8 max-w-xl text-center">
            <h1 className="text-balance text-[2rem] leading-[1.08] font-bold tracking-tight sm:text-5xl">
              Move money between your bank and stablecoins
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-pretty text-sm text-(--r-muted) sm:text-base">
              NGN, Cedi or Shilling, to USDC on Base, BSC or Stellar, and back.
            </p>
          </div>
          <div className="mx-auto max-w-[30rem]">
            {IS_TESTNET && (
              <div
                role="status"
                className="mb-4 rounded-2xl border border-(--r-caution)/40 bg-(--r-caution)/10 px-4 py-3 text-sm text-(--r-caution)"
              >
                You&apos;re on testnet. Transfers here use test funds and
                won&apos;t pay out to a real bank account.
              </div>
            )}
            {renderContent()}
          </div>
        </div>
      </section>

      <StellarConnectSheet
        uri={stellarConnectUri}
        onClose={cancelStellarConnect}
      />
      <CurrencySheet
        open={
          isCryptoModalOpen && (activeTab === "buy" || activeTab === "sell")
        }
        onOpenChange={setIsCryptoModalOpen}
        tab={activeTab === "sell" ? "sell" : "buy"}
        country={country.code}
        onCountrySelect={handleCountrySelect}
        tokens={activeTab === "buy" ? ["USDC"] : ["USDC", "USDT", "WETH"]}
        token={activeTab === "buy" ? buyReceiveType : cryptoType}
        onTokenSelect={(t) => {
          if (activeTab === "sell")
            setCryptoType(t as "USDC" | "USDT" | "WETH");
        }}
        network={rampNetwork}
        onNetworkSelect={handleNetworkSelect}
      />

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
        currencySymbol={country.symbol}
        walletAddress={walletAddress}
        network={
          rampNetwork === "bsc"
            ? "BSC"
            : rampNetwork === "stellar"
              ? "Stellar"
              : "Base"
        }
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
