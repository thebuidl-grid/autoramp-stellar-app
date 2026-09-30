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
import { HeroBackground } from "@/components/hero/hero-background";
import { BridgePanel, useExecuteTransfer } from "@/components/bridge/bridge-panel";
import { WalletPicker } from "@/components/bridge/wallet-picker";
import { ChainSelect } from "@/components/bridge/chain-select";
import {
  useBanks,
  useEstimateNgn,
  useUsdNgnRate,
  useOffRamp,
  useOnRamp,
  useInitializeSwap,
  useSwapWebSocket,
  useCreateSimpleSwap,
  useResolveAccount,
  useTokenBalances,
  useSwapQuote,
  useSwapExecution,
  useCorridors,
  useDebouncedValue,
} from "@/lib/hooks";
import {
  useBridgeChains,
  useChainTokens,
  useBuildEvmSwap,
} from "@/lib/hooks/use-bridge";
import type { CryptoOption } from "@/components/swap/crypto-selection-modal";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { parseFormattedNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { EmailOtpModal } from "@/components/auth/email-otp-modal";
import { copyToClipboard } from "@/lib/utils";
import { useStellarWallet } from "@/lib/hooks/use-stellar-wallet";
import { useEvmWallet } from "@/lib/hooks/use-evm-wallet";
import { waitForReceipt } from "@/lib/evm-tx";
import { useTransactionStore } from "@/lib/store";

// Hub-like assets with no corridor $100 minimum — mirrors the backend's
// SwapService.HUB_ASSET_CODES exactly.
const HUB_ASSET_CODES = new Set(["USDC", "XLM", "BRIDGE_USDC"]);

export default function HomePage() {
  const { toast } = useToast();
  const { data: corridors = [] } = useCorridors();
  // Every active corridor's stablecoin, keyed by code, for fiat lookups —
  // e.g. corridorByStable["CGHS"].fiatCurrency === "GHS".
  const corridorByStable = Object.fromEntries(
    corridors.map((c) => [c.stablecoinCode.toUpperCase(), c])
  );
  const fiatForStable = (code: string) =>
    corridorByStable[code.toUpperCase()]?.fiatCurrency || "NGN";
  // Generalizes fiatForStable to any stablecoin, on any chain — a named
  // regional stable (corridor code on Stellar, or a ChainToken on an EVM
  // chain) always has one natural home fiat, auto-populated once picked.
  // A hub/generic asset (XLM, BRIDGE_USDC, or plain "USDC" on any chain)
  // has no single natural fiat — returns null, meaning "let the user
  // choose their own payout corridor" (the flexibility this app already
  // relies on for e.g. "sell USDC for whichever local fiat you're in").
  const fiatForToken = (code: string, chain: string, chainTokensList: { tokenCode: string; fiatCurrency: string }[]): string | null => {
    const upper = code.toUpperCase();
    if (HUB_ASSET_CODES.has(upper)) return null;
    if (chain === "stellar") return corridorByStable[upper]?.fiatCurrency || null;
    return chainTokensList.find((t) => t.tokenCode.toUpperCase() === upper)?.fiatCurrency || null;
  };
  // Buy: today's default (Stellar) options are still just the corridor
  // list — no USDC (onramp mints the corridor's own stablecoin). An EVM
  // buyPayoutChain instead gets its options from useChainTokens below.
  const buyOptions: CryptoOption[] = corridors.map((c) => ({ code: c.stablecoinCode }));
  const buyFiatOptions: CryptoOption[] = Array.from(
    new Set(corridors.map((c) => c.fiatCurrency))
  ).map((code) => ({ code }));
  // Sell/Swap: any corridor stablecoin, plus the USDC hub.
  const stableOptions: CryptoOption[] = [
    ...corridors.map((c) => ({ code: c.stablecoinCode })),
    { code: "USDC" },
  ];
  // Swap tab only: adds native XLM and Circle's real bridge-compatible USDC
  // (a distinct asset from the "USDC" hub above) — lets a user fund a
  // wallet with real, CCTP-bridge-testable USDC starting from just testnet
  // XLM, via Stellar's own DEX liquidity.
  const swapOptions: CryptoOption[] = [
    ...stableOptions,
    { code: "XLM", label: "XLM" },
    { code: "BRIDGE_USDC", label: "USDC (Bridge)" },
  ];

  const offRamp = useOffRamp();
  const onRamp = useOnRamp();
  const initializeSwap = useInitializeSwap();
  const createSimpleSwap = useCreateSimpleSwap();
  const { address, isConnected } = useStellarWallet();

  const activeTab = useTransactionStore((state) => state.activeTab);
  const cryptoType = useTransactionStore((state) => state.cryptoType);
  const buyCryptoType = useTransactionStore((state) => state.buyCryptoType);
  const setBuyCryptoType = useTransactionStore((state) => state.setBuyCryptoType);
  const buyPayoutChain = useTransactionStore((state) => state.buyPayoutChain);
  const setBuyPayoutChain = useTransactionStore((state) => state.setBuyPayoutChain);
  const { data: buyChainTokens = [] } = useChainTokens(buyPayoutChain !== "stellar" ? buyPayoutChain : null);
  const { data: buyChains = [] } = useBridgeChains();
  const [manualBuyDestination, setManualBuyDestination] = useState(false);
  // Every Stellar corridor option already has an active corridor by
  // definition (useCorridors only returns active ones) — greying only
  // matters for EVM ChainTokens, whose fiat might not have a corridor yet.
  const buyTokenOptions: CryptoOption[] =
    buyPayoutChain === "stellar"
      ? buyOptions
      : [
          { code: "USDC" },
          ...buyChainTokens.map((t) => ({
            code: t.tokenCode,
            comingSoon: !corridors.some((c) => c.fiatCurrency === t.fiatCurrency),
          })),
        ];
  // The picked stablecoin's own natural fiat, auto-populated — null only
  // for the generic "USDC" pick on an EVM chain (a hub asset with no
  // single natural fiat), which is the one case that still needs a
  // manually-chosen payout corridor.
  const buyDerivedFiat = fiatForToken(buyCryptoType, buyPayoutChain, buyChainTokens);
  const buyIsHubPick = buyDerivedFiat === null;
  // Manual choice — only read/shown when buyIsHubPick.
  const buyFiatCurrencyChoice = useTransactionStore((state) => state.buyFiatCurrency);
  const setBuyFiatCurrency = useTransactionStore((state) => state.setBuyFiatCurrency);
  const isBuyFiatCurrencyModalOpen = useTransactionStore((state) => state.isBuyFiatCurrencyModalOpen);
  const setIsBuyFiatCurrencyModalOpen = useTransactionStore((state) => state.setIsBuyFiatCurrencyModalOpen);
  // Kept as an alias so the many existing buyCurrency call sites below
  // don't need touching.
  const buyCurrency = buyIsHubPick ? buyFiatCurrencyChoice : buyDerivedFiat;
  // The previously-picked token is almost never valid on a newly-picked
  // chain (a corridor code only exists on Stellar; a ChainToken code only
  // exists on its own chain) — reset to a safe default whenever the chain
  // itself changes, same pattern the bridge Swap tab already uses for
  // sourceTokenCode.
  useEffect(() => {
    setBuyCryptoType(buyPayoutChain === "stellar" ? (buyOptions[0]?.code || "CNGN") : "USDC");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyPayoutChain]);
  // Sell tab: `cryptoType` is what's being sold (any tradeable asset —
  // corridor stablecoins, USDC, XLM, BRIDGE_USDC); `sellPayoutCryptoType`
  // is a separate, user-chosen corridor selecting which local fiat the
  // proceeds pay out to. Selling a hub asset (USDC/XLM/BRIDGE_USDC) always
  // needs the swap route; selling a corridor stablecoin uses the direct
  // 1:1 offramp only when it matches the chosen payout corridor exactly.
  const sellPayoutCryptoType = useTransactionStore((state) => state.sellPayoutCryptoType);
  const setSellPayoutCryptoType = useTransactionStore((state) => state.setSellPayoutCryptoType);
  // Sell: which chain the sold asset lives on — 'stellar' keeps today's
  // direct-offramp/swap-then-offramp flow entirely unchanged. Any other
  // chain instead bridges in self-custodially (source-chain wallet signs
  // swap+burn, same mechanism the Cross-Chain Swap tab already uses) and
  // pays out as fiat once the bridge completes (BridgeService.deliverOfframp),
  // bypassing the Stellar deposit-memo flow entirely.
  const sellSourceChain = useTransactionStore((state) => state.sellSourceChain);
  const setSellSourceChain = useTransactionStore((state) => state.setSellSourceChain);
  const [sellSourceAddress, setSellSourceAddress] = useState<string | null>(null);
  const [manualSellSource, setManualSellSource] = useState(false);
  const { data: sellChains = [] } = useBridgeChains();
  const { data: sellChainTokens = [] } = useChainTokens(sellSourceChain !== "stellar" ? sellSourceChain : null);
  // Same greying rule as buyTokenOptions — only an EVM ChainToken can lack
  // a corridor for its fiat; every swapOptions entry already has one.
  const sellTokenOptions: CryptoOption[] =
    sellSourceChain === "stellar"
      ? swapOptions
      : [
          { code: "USDC" },
          ...sellChainTokens.map((t) => ({
            code: t.tokenCode,
            comingSoon: !corridors.some((c) => c.fiatCurrency === t.fiatCurrency),
          })),
        ];
  // The sold asset's own natural fiat, auto-populated — null only for a
  // hub asset (XLM, BRIDGE_USDC, or generic "USDC"), which keeps the
  // existing "choose any payout corridor" flexibility via
  // sellPayoutCryptoType instead (there's no single natural fiat for those).
  const sellDerivedFiat = fiatForToken(cryptoType, sellSourceChain, sellChainTokens);
  const sellIsHubPick = sellDerivedFiat === null;
  const sellCurrency = sellIsHubPick ? fiatForStable(sellPayoutCryptoType) : sellDerivedFiat;
  const sellDerivedCorridor = corridors.find((c) => c.fiatCurrency === sellCurrency);
  // Direct 1:1 offramp: selling a Stellar corridor's own stablecoin for its
  // own fiat, no swap needed — the only case auto-derive still allows to
  // skip the swap route (a hub asset always needs it; an EVM-chain asset
  // always needs the cross-chain bridge route instead).
  const isSellDirectOfframp = sellSourceChain === "stellar" && !sellIsHubPick;
  const { data: banks = [] } = useBanks(activeTab === "sell" ? sellCurrency : undefined);
  useEffect(() => {
    setCryptoType(sellSourceChain === "stellar" ? (swapOptions[0]?.code || "CNGN") : "USDC");
    setSellSourceAddress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellSourceChain]);
  const { execute: executeCrossChainSell, isBusy: isCrossChainSellBusy, isSigning: isCrossChainSellSigning } =
    useExecuteTransfer(() => {
      toast({
        title: "Sell submitted",
        description: "Bridging in progress — your bank payout will follow automatically once it completes.",
      });
      setSellAmount("");
      setBankCode("");
      setAccountNumber("");
    });
  const fromCryptoType = useTransactionStore((state) => state.fromCryptoType);
  const toCryptoType = useTransactionStore((state) => state.toCryptoType);
  // Swap: which chain the trade happens on — 'stellar' keeps today's
  // PathPaymentStrictSend flow entirely unchanged. Any other registered
  // EVM chain instead does a plain self-custodial 0x swap on that chain
  // (BridgeService.buildEvmSwap) — no bridging, nothing leaves the chain.
  const swapChain = useTransactionStore((state) => state.swapChain);
  const setSwapChain = useTransactionStore((state) => state.setSwapChain);
  const [swapEvmAddress, setSwapEvmAddress] = useState<string | null>(null);
  const [manualSwapChain, setManualSwapChain] = useState(false);
  const evmWallet = useEvmWallet();
  const { data: swapChainsList = [] } = useBridgeChains();
  const { data: swapChainTokens = [] } = useChainTokens(swapChain !== "stellar" ? swapChain : null);
  // No corridor/fiat greying here — a same-chain swap never touches fiat
  // at all, so every registered token on the chain is tradeable.
  const swapTokenOptions: CryptoOption[] =
    swapChain === "stellar" ? swapOptions : [{ code: "USDC" }, ...swapChainTokens.map((t) => ({ code: t.tokenCode }))];
  useEffect(() => {
    if (swapChain === "stellar") {
      setFromCryptoType("USDC");
      setToCryptoType(swapOptions[1]?.code || "CNGN");
    } else {
      setFromCryptoType("USDC");
      setToCryptoType(""); // force a real pick — there's no sensible default second token on an arbitrary chain
    }
    setSwapEvmAddress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapChain]);
  // swapChainTokens loads asynchronously after the chain itself changes —
  // once it's in, fill toCryptoType with the first real option rather
  // than leaving it blank indefinitely.
  useEffect(() => {
    if (swapChain !== "stellar" && !toCryptoType && swapChainTokens.length > 0) {
      setToCryptoType(swapChainTokens[0].tokenCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapChainTokens, swapChain, toCryptoType]);
  const buildEvmSwap = useBuildEvmSwap();
  const [isEvmSwapping, setIsEvmSwapping] = useState(false);
  const isCryptoModalOpen = useTransactionStore(
    (state) => state.isCryptoModalOpen
  );
  const isSellPayoutCryptoModalOpen = useTransactionStore(
    (state) => state.isSellPayoutCryptoModalOpen
  );
  const setIsSellPayoutCryptoModalOpen = useTransactionStore(
    (state) => state.setIsSellPayoutCryptoModalOpen
  );
  const isFromCryptoModalOpen = useTransactionStore(
    (state) => state.isFromCryptoModalOpen
  );
  const isToCryptoModalOpen = useTransactionStore(
    (state) => state.isToCryptoModalOpen
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
    (state) => state.setFromCryptoType
  );
  const setToCryptoType = useTransactionStore((state) => state.setToCryptoType);
  const setIsCryptoModalOpen = useTransactionStore(
    (state) => state.setIsCryptoModalOpen
  );
  const setIsFromCryptoModalOpen = useTransactionStore(
    (state) => state.setIsFromCryptoModalOpen
  );
  const setIsToCryptoModalOpen = useTransactionStore(
    (state) => state.setIsToCryptoModalOpen
  );
  const setSellAmount = useTransactionStore((state) => state.setSellAmount);
  const setBuyAmount = useTransactionStore((state) => state.setBuyAmount);
  const setBankCode = useTransactionStore((state) => state.setBankCode);
  const setAccountNumber = useTransactionStore(
    (state) => state.setAccountNumber
  );
  const setWalletAddress = useTransactionStore(
    (state) => state.setWalletAddress
  );
  const setIsAuthModalOpen = useTransactionStore(
    (state) => state.setIsAuthModalOpen
  );
  const setStep = useTransactionStore((state) => state.setStep);
  const setTransactionData = useTransactionStore(
    (state) => state.setTransactionData
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
  // M-Pesa STK push phone number — only asked for on Buy when the selected
  // corridor's onrampCollectionMethod is 'mobile_money' (KES today).
  const [phoneNumber, setPhoneNumber] = useState("");
  // Separate top-level section from the Buy/Sell/Swap tab group — CCTP
  // cross-chain USDC (Receive/Send/Swap) has its own self-contained state
  // machine (BridgePanel) rather than being wedged into `step`/`activeTab`.
  const [mainSection, setMainSection] = useState<"ramp" | "bridge">("ramp");
  const buyCorridor = corridors.find((c) => c.fiatCurrency === buyCurrency);
  const buyRequiresPhone = buyCorridor?.onrampCollectionMethod === "mobile_money";

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
    [toast]
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

  // Balances come from the backend (Horizon-backed) instead of a direct
  // on-chain contract read — same reactive shape, refetched periodically.
  const { data: balances } = useTokenBalances(isConnected ? address ?? undefined : undefined);
  const balanceOf = (code: string): number | undefined => {
    const raw = balances?.[code.toLowerCase()];
    return raw ? parseFloat(raw) : undefined;
  };

  // 1. Determine if we need a quote
  const isSwapMode = activeTab === "swap";
  // /swap/quote only resolves Stellar-side assets — an EVM swapChain signs
  // against a live 0x quote at submission time instead (see handleSwap),
  // no pre-submission preview.
  const swapNeedsQuote = isSwapMode && swapChain === "stellar";
  // Sell mode needs a quote whenever what's being sold isn't already the
  // chosen payout corridor's own stablecoin (a hub asset, or a different
  // corridor's stablecoin) — the direct 1:1 offramp path needs no quote.
  // A cross-chain sell (sellSourceChain !== "stellar") also skips this —
  // /swap/quote only resolves Stellar-side assets, and the cross-chain
  // path doesn't need a pre-submission quote anyway (it signs against a
  // live 0x quote at bridge-completion time instead).
  const isSellSwapMode = activeTab === "sell" && !isSellDirectOfframp && sellSourceChain === "stellar";
  const shouldFetchQuote = (swapNeedsQuote || isSellSwapMode) && !!sellAmount;

  // 2. Determine tokens for the quote
  let quoteFromToken: string | undefined;
  let quoteToToken: string | undefined;

  if (swapNeedsQuote) {
    quoteFromToken = fromCryptoType;
    quoteToToken = toCryptoType;
  } else if (isSellSwapMode) {
    // Sell Mode: whatever's being sold -> the user-chosen payout corridor's stablecoin.
    quoteFromToken = cryptoType;
    quoteToToken = sellPayoutCryptoType;
  }

  const parsedQuoteAmount = sellAmount ? parseFormattedNumber(sellAmount) : null;
  // Debounced so typing a multi-digit amount doesn't fire a fresh
  // /swap/quote request on every keystroke — without this, a handful of
  // keystrokes can trip the API's per-minute rate limit and leave the
  // quote stuck failed (surfaces to the user as "Quote not ready" even
  // once they stop typing, since useSwapQuote doesn't retry on error).
  const debouncedQuoteAmount = useDebouncedValue(parsedQuoteAmount, 400);

  // 3. Live quote via Stellar path-payment routing (backend-driven —
  // replaces the old direct on-chain Aerodrome quoter read)
  const { data: quote, isLoading: isQuoteLoading } = useSwapQuote(
    shouldFetchQuote ? quoteFromToken : undefined,
    shouldFetchQuote ? quoteToToken : undefined,
    shouldFetchQuote ? debouncedQuoteAmount : null
  );

  const quoteAmountOut = quote ? parseFloat(quote.destinationAmount) : 0;

  // Swap execution: builds/signs/submits the PathPaymentStrictSend and
  // handles the trustline gate. Replaces the old approve+exactInputSingle
  // wagmi flow entirely.
  const swapExecution = useSwapExecution({
    swapData,
    step,
    activeTab,
    setStep,
    setSwapData,
  });

  // Daisy-chain: auto-trigger swap once funding (if needed) and a trustline
  // (if needed) have both resolved. Funding must resolve first — the
  // trustline check itself can't run against an account that doesn't
  // exist yet — but useSwapExecution's own query ordering already handles
  // that; this effect just waits for both gates to clear.
  useEffect(() => {
    if (
      isAutoSwapping &&
      !swapExecution.needsFunding &&
      !swapExecution.isFundingAccount &&
      !swapExecution.needsTrustline &&
      !swapExecution.isAddingTrustline
    ) {
      setIsAutoSwapping(false);
      swapExecution.handleExecuteSwap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    swapExecution.needsFunding,
    swapExecution.isFundingAccount,
    swapExecution.needsTrustline,
    swapExecution.isAddingTrustline,
    isAutoSwapping,
  ]);

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
    setBuyAmount(formatted);
  };

  const handleCryptoSelect = (type: string) => {
    setCryptoType(type);
    setIsCryptoModalOpen(false);
  };

  const handleBuyCryptoSelect = (type: string) => {
    setBuyCryptoType(type);
    setIsCryptoModalOpen(false);
  };

  const handleSellPayoutCryptoSelect = (type: string) => {
    setSellPayoutCryptoType(type);
    setIsSellPayoutCryptoModalOpen(false);
  };

  // When a pick collides with the other side of the swap, bump the other
  // side to the next available option instead of a hardcoded CNGN/USDC swap.
  const otherStableOption = (taken: string) =>
    swapTokenOptions.find((o) => o.code !== taken)?.code || "USDC";

  const handleFromCryptoSelect = (type: string) => {
    setFromCryptoType(type);
    setIsFromCryptoModalOpen(false);
    if (type === toCryptoType) {
      setToCryptoType(otherStableOption(type));
    }
  };

  const handleToCryptoSelect = (type: string) => {
    setToCryptoType(type);
    setIsToCryptoModalOpen(false);
    if (type === fromCryptoType) {
      setFromCryptoType(otherStableOption(type));
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
    setPhoneNumber("");
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
  }, [accountNumber, bankCode, activeTab, resolveAccount.mutate]);

  // Handle sell: corridor stablecoin -> its fiat (offramp), or USDC -> the
  // default corridor's fiat (swap; destination corridor not yet selectable
  // for USDC sells)
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

    if (sellSourceChain !== "stellar") {
      // Selling an asset that lives on another chain — self-custodial
      // bridge-in (the connected wallet on sellSourceChain signs swap+burn),
      // paid out as fiat once the bridge completes server-side. No Stellar
      // wallet or deposit-memo flow involved at all.
      if (!sellSourceAddress) {
        toast({
          title: "Connect the wallet holding the asset to sell",
          variant: "destructive",
        });
        return;
      }

      // Named stablecoin (e.g. BRZ, EURC): payout fiat is auto-derived
      // (sellCurrency) and must have an active corridor. Hub asset (generic
      // USDC): payout fiat is whichever corridor sellPayoutCryptoType picked.
      if (!sellDerivedCorridor) {
        toast({
          title: sellIsHubPick ? "Pick a payout currency" : `${sellCurrency} isn't supported yet`,
          description: sellIsHubPick ? undefined : "AutoRamp doesn't have a bank rail for this stablecoin's currency yet.",
          variant: "destructive",
        });
        return;
      }

      executeCrossChainSell({
        sourceChain: sellSourceChain,
        destinationChain: "stellar",
        sourceTokenCode: cryptoType !== "USDC" ? cryptoType : undefined,
        expectedAmount: parsedAmount,
        payoutFiat: true,
        payoutBankCode: bankCode,
        payoutAccountNumber: accountNumber,
        payoutFiatCurrency: sellCurrency,
        sourceAddress: sellSourceAddress,
      });
      return;
    }

    if (isSellDirectOfframp) {
      // Selling the payout corridor's own stablecoin — 1:1, no swap needed.
      if (parsedAmount < 100) {
        toast({
          title: "Invalid amount",
          description: `Minimum amount for ${cryptoType} is 100`,
          variant: "destructive",
        });
        return;
      }

      const amountToSend = Math.round(parsedAmount);
      offRamp.mutate(
        {
          network: "stellar",
          amount: amountToSend,
          currency: sellCurrency,
          destination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response) => {
            setTransactionData(response.data);
            setStep("pending");
          },
        }
      );
    } else {
      // Selling something other than the chosen payout corridor's own
      // stablecoin (a hub asset, or a different corridor's stablecoin) —
      // swap it into the payout corridor's stablecoin first, then offramp.
      if (!isConnected || !address) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet to continue",
          variant: "destructive",
        });
        return;
      }

      if (!quoteAmountOut) {
        toast({
          title: "Quote not ready",
          description: "Please wait for the exchange rate to load.",
          variant: "destructive",
        });
        return;
      }

      const projectedPayoutAmount = quoteAmountOut;

      if (projectedPayoutAmount < 100) {
        toast({
          title: "Amount too low",
          description: `Minimum withdrawal is 100 ${sellCurrency}. Estimated output: ${projectedPayoutAmount.toFixed(
            2
          )} ${sellCurrency}`,
          variant: "destructive",
        });
        return;
      }

      initializeSwap.mutate(
        {
          amount: projectedPayoutAmount,
          fromAmount: parsedAmount,
          fromTokenType: cryptoType,
          currency: sellCurrency,
          slippage: 0.05,
          network: "stellar",
          offrampDestination: { bankCode, accountNumber },
        },
        {
          onSuccess: (response) => {
            setSwapData(response.data);
            setStep("execute");
          },
        }
      );
    }
  };

  // Handle buy: fiat -> the selected corridor's stablecoin (onramp)
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

    if (buyRequiresPhone && !phoneNumber) {
      toast({
        title: "Phone number required",
        description: "Enter the phone number to receive the M-Pesa payment prompt",
        variant: "destructive",
      });
      return;
    }

    const sanitizedAmount = buyAmount.replace(/[^0-9.]/g, ""); // removes commas, currency symbols, spaces
    const parsedAmount = parseFloat(sanitizedAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 100) {
      toast({
        title: "Invalid amount",
        description: `Minimum amount is 100 ${buyCurrency}`,
        variant: "destructive",
      });
      return;
    }

    onRamp.mutate(
      {
        network: "stellar",
        amount: parsedAmount,
        currency: buyCurrency,
        destination: {
          address: walletAddress,
          ...(buyRequiresPhone ? { phoneNumber } : {}),
        },
        payoutChain: buyPayoutChain,
        payoutTokenCode: buyCryptoType,
      },
      {
        onSuccess: (response) => {
          setTransactionData(response.data);
          setStep("pending");
        },
      }
    );
  };

  // Unified handler for the execute step: funds the account first if it
  // doesn't exist on-chain yet, then adds a trustline if needed, otherwise
  // executes the swap directly.
  const handleUnifiedSwap = () => {
    if (swapExecution.needsFunding) {
      setIsAutoSwapping(true);
      swapExecution.handleFundAccount();
    } else if (swapExecution.needsTrustline) {
      setIsAutoSwapping(true);
      swapExecution.handleAddTrustline();
    } else {
      swapExecution.handleExecuteSwap();
    }
  };

  // Handle swap: USDC <-> CNGN (simple swap, no offramp)
  const handleSwap = async () => {
    if (swapChain !== "stellar") {
      // Same-chain EVM swap — self-custodial, no bridging: fetch unsigned
      // approve+swap calldata, sign both with the connected EVM wallet.
      if (!swapEvmAddress) {
        toast({ title: "Connect a wallet on this chain", variant: "destructive" });
        return;
      }
      if (!fromCryptoType || !toCryptoType || fromCryptoType === toCryptoType) {
        toast({ title: "Pick two different tokens", variant: "destructive" });
        return;
      }
      if (!sellAmount) {
        toast({ title: "Missing amount", description: "Please enter an amount to swap", variant: "destructive" });
        return;
      }
      const parsedEvmAmount = parseFormattedNumber(sellAmount);
      if (parsedEvmAmount <= 0) {
        toast({ title: "Invalid amount", variant: "destructive" });
        return;
      }

      setIsEvmSwapping(true);
      try {
        const response = await buildEvmSwap.mutateAsync({
          chainName: swapChain,
          sellTokenCode: fromCryptoType,
          buyTokenCode: toCryptoType,
          sellAmount: parsedEvmAmount,
          takerAddress: swapEvmAddress,
        });
        const approveHash = await evmWallet.sendTransaction(response.data.approveTransaction);
        await waitForReceipt(approveHash);
        const swapHash = await evmWallet.sendTransaction(response.data.swapTransaction);
        await waitForReceipt(swapHash);
        toast({
          title: "Swap complete",
          description: `Received ≈ ${response.data.estimatedOutput} ${toCryptoType}`,
        });
        setSellAmount("");
      } catch (error: any) {
        toast({
          title: "Swap failed",
          description: error?.response?.data?.message || error?.message || "Please try again",
          variant: "destructive",
        });
      } finally {
        setIsEvmSwapping(false);
      }
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

    // Amount limits — mirrors the backend's generic rule
    // (SwapService.createSimpleSwap / HUB_ASSET_CODES): any leg that's a
    // corridor stablecoin (not USDC/XLM/BRIDGE_USDC) needs at least 100
    // units, since those represent real-world fiat amounts. Hub-like
    // assets on both sides (e.g. XLM -> BRIDGE_USDC) have no floor.
    const isFromHub = HUB_ASSET_CODES.has(fromCryptoType);
    const isToHub = HUB_ASSET_CODES.has(toCryptoType);

    if (!isFromHub && parsedAmount < 100) {
      toast({
        title: "Invalid amount",
        description: `Minimum amount is 100 ${fromCryptoType}`,
        variant: "destructive",
      });
      return;
    }
    if (isFromHub && !isToHub) {
      const estimatedOut = quoteAmountOut || 0;

      // Minimum 100 units of the destination stablecoin
      if (estimatedOut < 100) {
        toast({
          title: "Amount too low",
          description: `Minimum amount is 100 ${toCryptoType} equivalent (approx. ${(100 / (estimatedOut / parsedAmount)).toFixed(4)} ${fromCryptoType})`,
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
    if (!quote || !quoteAmountOut) {
      toast({
        title: "Quote not ready",
        description: "Please wait for the exchange rate to load.",
        variant: "destructive",
      });
      return;
    }

    // 2. Execution — store in DB, actual on-chain swap happens in the
    // execute step via useSwapExecution
    createSimpleSwap.mutate(
      {
        fromTokenType: fromCryptoType,
        toTokenType: toCryptoType,
        fromAmount: parsedAmount,
        toAmount: quoteAmountOut,
        exchangeRate: quote.exchangeRate,
        sourceAddress: address,
        destinationAddress: address,
        network: "stellar",
      },
      {
        onSuccess: (response) => {
          setSwapData({
            swap: response.data,
            recipientAddress: address,
            swapParams: {
              sendAsset: quote.sourceAsset,
              sendAmount: parsedAmount.toString(),
              destAsset: quote.destAsset,
              // toFixed(7), not toString() — Stellar rejects destMin values
              // with more than 7 decimal places, which floating-point
              // multiplication routinely produces.
              destMin: (quoteAmountOut * 0.95).toFixed(7), // 5% slippage
              destination: address,
              memo: undefined,
              slippage: 0.05,
            },
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
      }
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

  // Helper to handle percentage clicks
  const handlePercentageClick = (rawValue: string) => {
    const formatted = formatNumber(rawValue);
    if (activeTab === "buy") {
      setBuyAmount(formatted);
    } else {
      setSellAmount(formatted);
    }
  };

  // Helper to get the currently relevant balance
  let activeBalance: number | undefined = undefined;

  // balanceOf reads Stellar-side balances only — an EVM sellSourceChain/
  // swapChain has no equivalent lookup wired up yet, so leave it
  // undefined there rather than show a stale/wrong Stellar balance.
  if (activeTab === "sell" && sellSourceChain === "stellar") {
    activeBalance = balanceOf(cryptoType);
  } else if (activeTab === "swap" && swapChain === "stellar") {
    activeBalance = balanceOf(fromCryptoType);
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
                ? buyCurrency
                : activeTab === "swap"
                  ? fromCryptoType
                  : cryptoType
            }
            onCurrencyClick={
              activeTab === "buy"
                ? (buyIsHubPick ? () => setIsBuyFiatCurrencyModalOpen(true) : undefined)
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
                : activeTab === "sell" && sellSourceChain !== "stellar"
                  ? "≈" // No pre-submission quote for a cross-chain sell — the exact payout is set by a live rate at bridge-completion time, not knowable up front.
                  : activeTab === "swap" && swapChain !== "stellar"
                    ? "≈" // Same reasoning — an EVM same-chain swap signs against a live 0x quote at submission, not a pre-fetched one.
                    : activeTab === "swap" ||
                    (activeTab === "sell" && !isSellDirectOfframp)
                  ? (() => {
                    // --- SHARED LOGIC FOR SWAP AND SELL (swap route) ---
                    if (!sellAmount) return "";

                    if (isQuoteLoading) return "...";

                    if (quoteAmountOut > 0) {
                      return quoteAmountOut.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });
                    }
                    return "0.00";
                  })()
                  : (() => {
                    // --- LOGIC FOR SELL (direct offramp: sold asset === payout corridor's own stablecoin) ---
                    // 1:1, no swap needed
                    if (!sellAmount) return "";
                    const parsed = parseFormattedNumber(sellAmount);
                    return parsed.toLocaleString("en-NG");
                  })()
            }
            onAmountChange={() => { }}
            currencyType={
              activeTab === "buy"
                ? buyCryptoType
                : activeTab === "swap"
                  ? toCryptoType
                  : sellCurrency
            }
            onCurrencyClick={
              activeTab === "buy"
                ? () => setIsCryptoModalOpen(true)
                : activeTab === "swap"
                  ? () => setIsToCryptoModalOpen(true)
                  : activeTab === "sell" && sellIsHubPick
                    ? () => setIsSellPayoutCryptoModalOpen(true)
                    : undefined
            }
            disabled={true}
            isLoading={
              (needsConversion && isLoadingEstimate) ||
              (activeTab === "swap" && isQuoteLoading)
            }
          />

          {activeTab === "buy" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-white/70 block">
                  Deliver to
                </label>
                <button
                  type="button"
                  onClick={() => setManualBuyDestination((v) => !v)}
                  className="text-xs text-white/50 hover:text-white/80"
                >
                  {manualBuyDestination ? "Connect a wallet instead" : "Enter address manually"}
                </button>
              </div>

              {manualBuyDestination ? (
                <div className="space-y-2">
                  <ChainSelect chains={buyChains} value={buyPayoutChain} onValueChange={setBuyPayoutChain} />
                  <Input
                    type="text"
                    placeholder={buyPayoutChain === "stellar" ? "G..." : "0x..."}
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    className="h-14 bg-black/50! border-white/10 text-white placeholder:text-white/30 border-0! outline-0!  focus:ring-0 focus:outline-0 focus:border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              ) : (
                <WalletPicker
                  onResolved={(chain, addr) => {
                    setBuyPayoutChain(chain);
                    setWalletAddress(addr);
                  }}
                  onDisconnect={() => {
                    setBuyPayoutChain("stellar");
                    setWalletAddress("");
                  }}
                />
              )}
            </div>
          )}

          {activeTab === "buy" && buyRequiresPhone && (
            <div className="space-y-2">
              <label className="text-sm text-white/70 mb-3 block">
                M-Pesa Phone Number
              </label>
              <Input
                type="tel"
                placeholder="+254712345678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="h-14 bg-black/50! border-white/10 text-white placeholder:text-white/30 border-0! outline-0! focus:ring-0 focus:outline-0 focus:border-0"
              />
              <p className="text-xs text-white/50">
                We&apos;ll send an M-Pesa payment prompt to this number
              </p>
            </div>
          )}

          {activeTab === "sell" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-white/70 block">
                  Sell from
                </label>
                <button
                  type="button"
                  onClick={() => setManualSellSource((v) => !v)}
                  className="text-xs text-white/50 hover:text-white/80"
                >
                  {manualSellSource ? "Connect a wallet instead" : "Enter chain manually"}
                </button>
              </div>

              {manualSellSource ? (
                <ChainSelect chains={sellChains} value={sellSourceChain} onValueChange={setSellSourceChain} />
              ) : (
                <WalletPicker
                  onResolved={(chain, addr) => {
                    setSellSourceChain(chain);
                    setSellSourceAddress(addr);
                  }}
                  onDisconnect={() => {
                    setSellSourceChain("stellar");
                    setSellSourceAddress(null);
                  }}
                />
              )}
            </div>
          )}

          {activeTab === "sell" && (
            <div className="space-y-2">
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

          {activeTab === "swap" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-white/70 block">Swap on</label>
                <button
                  type="button"
                  onClick={() => setManualSwapChain((v) => !v)}
                  className="text-xs text-white/50 hover:text-white/80"
                >
                  {manualSwapChain ? "Connect a wallet instead" : "Enter chain manually"}
                </button>
              </div>

              {manualSwapChain ? (
                <ChainSelect chains={swapChainsList} value={swapChain} onValueChange={setSwapChain} />
              ) : (
                <WalletPicker
                  onResolved={(chain, addr) => {
                    setSwapChain(chain);
                    if (chain !== "stellar") setSwapEvmAddress(addr);
                  }}
                  onDisconnect={() => {
                    setSwapChain("stellar");
                    setSwapEvmAddress(null);
                  }}
                />
              )}
            </div>
          )}


          <Button
            type="submit"
            className="w-full h-14 text-sm md:font-medium rounded-xl bg-secondary hover:bg-secondary/90 text-black"
            disabled={
              (activeTab === "sell" &&
                (!accountResolved || !accountName || resolveAccount.isPending)) ||
              (activeTab === "sell" && !sellIsHubPick && !sellDerivedCorridor) ||
              (activeTab === "buy" && !buyCorridor)
            }
            isLoading={
              (activeTab === "sell" && offRamp.isPending) ||
              (activeTab === "sell" &&
                !isSellDirectOfframp &&
                initializeSwap.isPending) ||
              (activeTab === "sell" &&
                sellSourceChain !== "stellar" &&
                (isCrossChainSellBusy || isCrossChainSellSigning)) ||
              (activeTab === "buy" && onRamp.isPending) ||
              (activeTab === "swap" && swapChain === "stellar" && createSimpleSwap.isPending) ||
              (activeTab === "swap" && swapChain !== "stellar" && (buildEvmSwap.isPending || isEvmSwapping))
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
      // 1. EXTRACT DATA FROM THE SNAPSHOT
      const fromAmount = Number(swapData.swap.fromAmount);
      const toAmount = Number(swapData.swap.toAmount);
      const exchangeRate = swapData.swap.exchangeRate;

      // 2. IDENTIFY TOKENS — from swap.fromTokenType/toTokenType (the
      // actual app-level token type, e.g. "BRIDGE_USDC"), not
      // swapParams.sendAsset/destAsset.code (the raw Stellar asset code,
      // "USDC" for both AutoRamp's own USDC and Circle's real bridge one).
      const fromToken = swapData.swap?.fromTokenType || swapData.swapParams?.sendAsset?.code || "USDC";
      const toToken = swapData.swap?.toTokenType || swapData.swapParams?.destAsset?.code || "CNGN";

      // 3. DETERMINE DISPLAY CONTEXT
      const isSellFlow = activeTab === "sell";
      const displayCurrency = isSellFlow ? "NGN" : toToken;

      // 4. PREPARE EXCHANGE RATE LABEL
      let exchangeRateDisplay: React.ReactNode = null;

      if (exchangeRate) {
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
                  maximumFractionDigits: 2,
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
              !swapExecution.checksReady ||
              swapExecution.isCheckingAccountExists ||
              swapExecution.isFundingAccount ||
              (swapExecution.needsFunding && !swapExecution.canFundViaFriendbot) ||
              swapExecution.isCheckingTrustline ||
              swapExecution.isAddingTrustline ||
              swapExecution.isExecuting ||
              swapExecution.isSwapSuccess
            }
          >
            {!swapExecution.checksReady || swapExecution.isCheckingAccountExists ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Checking Wallet...
              </>
            ) : swapExecution.isFundingAccount ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Funding Wallet...
              </>
            ) : swapExecution.needsFunding && swapExecution.canFundViaFriendbot ? (
              "Fund Wallet with Testnet XLM"
            ) : swapExecution.needsFunding ? (
              "Wallet needs XLM before you can swap"
            ) : swapExecution.isCheckingTrustline ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Checking Trustline...
              </>
            ) : swapExecution.isAddingTrustline ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Adding Trustline...
              </>
            ) : swapExecution.isExecuting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Executing Swap...
              </>
            ) : swapExecution.isSwapSuccess ? (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Swap Successful!
              </>
            ) : swapExecution.needsTrustline ? (
              `Add Trustline & Swap ${toToken}`
            ) : (
              "Confirm Swap"
            )}
          </Button>

          {isAutoSwapping && swapExecution.isFundingAccount && (
            <p className="text-xs text-center text-white/50 mt-2">
              Please wait. Once your wallet is funded, we'll continue
              automatically with the trustline (if needed) and the swap.
            </p>
          )}

          {isAutoSwapping && swapExecution.isAddingTrustline && (
            <p className="text-xs text-center text-white/50 mt-2">
              Please wait. The swap transaction will prompt automatically after
              the trustline is added.
            </p>
          )}

          {swapExecution.needsFunding && !swapExecution.canFundViaFriendbot && (
            <p className="text-xs text-center text-amber-400/80 mt-2">
              This wallet doesn't exist on-chain yet — send it some XLM first,
              then try again.
            </p>
          )}

          {swapExecution.swapHash && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-green-400" size={20} />
                <span className="text-green-400 font-semibold">
                  Transaction Submitted
                </span>
              </div>
              <code className="text-xs text-white/70 break-all">
                {swapExecution.swapHash}
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
                ? transactionData?.data?.depositAccount?.collectionMethod === "mobile_money_push"
                  ? "Check your phone and approve the M-Pesa prompt. We'll automatically detect your payment."
                  : "Please complete the bank transfer. We'll automatically detect your payment."
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

          {activeTab === "buy" &&
            transactionData?.data?.depositAccount?.collectionMethod === "mobile_money_push" && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
                <div>
                  <span className="text-amber-400/80 text-xs font-bold uppercase tracking-wider mb-1 block">
                    Amount to Pay
                  </span>
                  <p className="text-2xl font-bold text-white tracking-tight">
                    {buyAmount} <span className="text-lg font-medium text-amber-400">{buyCurrency}</span>
                  </p>
                </div>
                <div className="h-px bg-amber-500/20 w-full" />
                <div className="flex items-start gap-2">
                  <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={16} />
                  <p className="text-sm text-white/80">
                    {transactionData.data.depositAccount.displayMessage ||
                      "Enter your M-Pesa PIN on your phone to approve this payment."}
                  </p>
                </div>
              </div>
            )}

          {activeTab === "buy" &&
            transactionData?.data?.depositAccount &&
            transactionData.data.depositAccount.collectionMethod !== "mobile_money_push" && (
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
                          transactionData.data.depositAccount.accountNumber
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

                {/* 2. Address + Memo Section */}
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
                          transactionData.data.depositAddress
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

                  {transactionData.data.memo && (
                    <div className="flex items-center gap-2 bg-black/20 p-2 mt-2 rounded-lg border border-amber-500/10">
                      <span className="text-xs text-amber-400/70 shrink-0">
                        Memo (required)
                      </span>
                      <code className="text-xs text-white flex-1 break-all font-mono">
                        {transactionData.data.memo}
                      </code>
                      <button
                        onClick={async () => {
                          const success = await copyToClipboard(
                            transactionData.data.memo
                          );
                          if (success) {
                            toast({ title: "Memo copied!", variant: "success" });
                          }
                        }}
                        className="p-1 hover:bg-white/10 rounded-md transition-colors"
                      >
                        <Copy size={14} className="text-amber-400/50" />
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-white/50 mt-2">
                    Please send exactly <strong>{sellAmount} CNGN</strong> to
                    the address above
                    {transactionData.data.memo
                      ? " with the memo included — without it, we can't match your deposit."
                      : "."}
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
              Send <span className="text-secondary">money</span> across
              <span className="text-secondary"> borders</span>, powered by{" "}
              <span className="text-secondary">crypto</span>
            </h1>
          </div>
          <div className="max-w-xl mx-auto">
            <div className="flex gap-2 mb-4 p-1 bg-white/5 rounded-2xl border border-white/10">
              <button
                type="button"
                onClick={() => setMainSection("ramp")}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  mainSection === "ramp" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                }`}
              >
                Buy / Sell / Swap
              </button>
              <button
                type="button"
                onClick={() => setMainSection("bridge")}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  mainSection === "bridge" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                }`}
              >
                Cross-Chain USDC
              </button>
            </div>
            {mainSection === "ramp" ? renderContent() : <BridgePanel />}
          </div>
        </div>
      </section>

      {activeTab === "buy" ? (
        <CryptoSelectionModal
          open={isCryptoModalOpen}
          onOpenChange={setIsCryptoModalOpen}
          selectedCrypto={buyCryptoType}
          onSelect={handleBuyCryptoSelect}
          options={buyTokenOptions}
        />
      ) : (
        <CryptoSelectionModal
          open={isCryptoModalOpen}
          onOpenChange={setIsCryptoModalOpen}
          selectedCrypto={cryptoType}
          onSelect={handleCryptoSelect}
          options={activeTab === "sell" ? sellTokenOptions : swapOptions}
        />
      )}

      <CryptoSelectionModal
        open={isBuyFiatCurrencyModalOpen}
        onOpenChange={setIsBuyFiatCurrencyModalOpen}
        selectedCrypto={buyFiatCurrencyChoice}
        onSelect={(code) => setBuyFiatCurrency(code)}
        options={buyFiatOptions}
        title="Select currency"
      />

      <CryptoSelectionModal
        open={isSellPayoutCryptoModalOpen}
        onOpenChange={setIsSellPayoutCryptoModalOpen}
        selectedCrypto={sellPayoutCryptoType}
        onSelect={handleSellPayoutCryptoSelect}
        options={buyOptions}
        title="Select payout currency"
      />

      <CryptoSelectionModal
        open={isFromCryptoModalOpen}
        onOpenChange={setIsFromCryptoModalOpen}
        selectedCrypto={fromCryptoType}
        onSelect={handleFromCryptoSelect}
        options={swapTokenOptions}
      />

      <CryptoSelectionModal
        open={isToCryptoModalOpen}
        onOpenChange={setIsToCryptoModalOpen}
        selectedCrypto={toCryptoType}
        onSelect={handleToCryptoSelect}
        options={swapTokenOptions}
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
