"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useSwitchChain, useSendTransaction, useWriteContract, useSignTypedData, useConfig, useReadContract } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { parseUnits, hexToBigInt, maxUint256, concat, formatUnits } from "viem";
import axios from "axios";
import { Loader2, ShieldCheck, ArrowUpRight, Info, CheckCircle, RefreshCw, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwapSection } from "@/components/swap/swap-section";
import { ChainSelector } from "@/components/swap/chain-selector";
import { ChainSelectionModal } from "@/components/swap/chain-selection-modal";
import { useStacksWallet } from "@/lib/hooks/use-stacks-wallet";
import { useStacksBurn, useStacksWithdrawalStatus } from "@/lib/hooks/use-stacks-burn";
import { useXReserveStacks } from "@/lib/hooks/use-xreserve-stacks";
import { useBridge, useBridgeStatus } from "@/lib/hooks/use-bridge";
import { isStacksAddress } from "@/lib/xreserve/stacks";
import { formatNumber, parseFormattedNumber } from "@/lib/utils";
import { SWAP_CONSTANTS, ERC20_ABI } from "@/lib/constants/swap-constants";
import { IS_TESTNET } from "@/lib/constants/networks";
import {
  PEG_OUT_FEE_USDC,
  PEG_OUT_MIN_USDCX,
  XRESERVE_DEFAULT_SOURCE_CHAIN_ID,
  XRESERVE_ETHEREUM_CHAIN_ID,
  XRESERVE_SEPOLIA_CHAIN_ID,
  XRESERVE_SOURCE_CHAIN_CONFIG,
  XRESERVE_SUPPORTED_SOURCE_CHAINS,
  type XReserveSourceChainId,
} from "@/lib/constants/xreserve-constants";

type Direction = "redeem" | "deposit";

/** Ethereum source chain label + explorer/API links for the active network. */
const ETH_NETWORK_LABEL = IS_TESTNET ? "Sepolia" : "Ethereum";
const NETWORK_LABEL = IS_TESTNET ? "Testnet" : "Mainnet";
const ETHSCAN_TX_BASE = IS_TESTNET
  ? "https://sepolia.etherscan.io/tx/"
  : "https://etherscan.io/tx/";
const STACKS_EXPLORER_CHAIN = IS_TESTNET ? "testnet" : "mainnet";
const STX_TX_BASE = "https://explorer.hiro.so/txid/";
/** Ethereum chain + USDC contract where a redeem (burn) payout lands (domain 0). */
const ETH_SETTLE_CHAIN_ID = IS_TESTNET
  ? XRESERVE_SEPOLIA_CHAIN_ID
  : XRESERVE_ETHEREUM_CHAIN_ID;
const ETH_SETTLE_USDC = XRESERVE_SOURCE_CHAIN_CONFIG[ETH_SETTLE_CHAIN_ID]
  ?.usdcAddress as `0x${string}` | undefined;
/** Bridge legs after a burn settles: Ethereum -> Base on the active network. */
const BRIDGE_FROM_CHAIN = IS_TESTNET ? "Ethereum_Sepolia" : "Ethereum";
const BRIDGE_TO_CHAIN = IS_TESTNET ? "Base_Sepolia" : "Base";

interface UsdcxSwapPanelProps {
  /** "redeem": USDCx (Stacks) -> USDC (Base). "deposit": USDC (source chain) -> USDCx (Stacks). */
  direction: Direction;
  /** After USDC lands on Base: keep as USDC, or auto-swap to CNGN. */
  receiveToken?: "USDC" | "CNGN";
  /** Pre-fill the amount input (from the reviewed quote). */
  defaultAmount?: string;
}

export function UsdcxSwapPanel({
  direction,
  receiveToken = "USDC",
  defaultAmount = "",
}: UsdcxSwapPanelProps) {
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const {
    stacksAddress,
    isStacksConnected,
    isConnecting,
    connectStacks,
    disconnectStacks,
  } = useStacksWallet();

  const [amount, setAmount] = useState(defaultAmount);

  // Source chain selection — only chains supported by xReserve on this network.
  // Default to the network's primary source. For redeem direction the
  // destination Ethereum chain is always fixed.
  const [sourceChainId, setSourceChainId] = useState<XReserveSourceChainId>(
    XRESERVE_DEFAULT_SOURCE_CHAIN_ID,
  );
  const [isSourceChainModalOpen, setIsSourceChainModalOpen] = useState(false);

  // Reset source chain selection whenever the direction flips.
  // Deposit: user can pick any supported source. Redeem: source is Stacks (locked).
  useEffect(() => {
    setSourceChainId(XRESERVE_DEFAULT_SOURCE_CHAIN_ID);
    setIsSourceChainModalOpen(false);
  }, [direction]);

  const sourceChain = XRESERVE_SUPPORTED_SOURCE_CHAINS.find(
    (c) => c.chainId === sourceChainId,
  ) ?? XRESERVE_SUPPORTED_SOURCE_CHAINS[0];
  const sourceChainLabels = XRESERVE_SUPPORTED_SOURCE_CHAINS.map(
    (c) => c.label,
  ).join(" or ");

  const burn = useStacksBurn();
  const { info: withdrawalInfo } = useStacksWithdrawalStatus(
    burn.burnTxid,
    0,
    burn.burnTxid !== undefined,
  );
  const xreserve = useXReserveStacks();

  // ETH-side settlement ground truth: after a burn, watch the recipient's USDC
  // balance on Ethereum. The USDCx withdrawal API can lag or 404 on mainnet
  // while its indexer catches up — a balance increase means Circle released the
  // USDC regardless. Baseline is captured from the first read after the burn.
  const { data: ethUsdcBalance } = useReadContract({
    address: ETH_SETTLE_USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    chainId: ETH_SETTLE_CHAIN_ID,
    query: {
      enabled: Boolean(burn.burnTxid && address && ETH_SETTLE_USDC),
      refetchInterval: 10_000,
    },
  });
  const ethUsdcBaselineRef = useRef<bigint | null>(null);
  const baselineTxRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      burn.burnTxid &&
      baselineTxRef.current !== burn.burnTxid &&
      typeof ethUsdcBalance === "bigint"
    ) {
      baselineTxRef.current = burn.burnTxid;
      ethUsdcBaselineRef.current = ethUsdcBalance;
    }
  }, [burn.burnTxid, ethUsdcBalance]);
  const ethSettled =
    burn.burnTxid !== undefined &&
    ethUsdcBaselineRef.current !== null &&
    typeof ethUsdcBalance === "bigint" &&
    ethUsdcBalance > ethUsdcBaselineRef.current;

  // Settlement chain after burn: Ethereum USDC -> (bridge) -> Base -> (optional) CNGN
  const { executeBridge, isBridging, bridgeResult } = useBridge();
  const [bridgeReference, setBridgeReference] = useState<string | undefined>();
  const [bridgeStep, setBridgeStep] = useState<"idle" | "bridging" | "done">("idle");
  const { data: bridgeStatus } = useBridgeStatus(
    bridgeReference && bridgeStep !== "done" ? bridgeReference : undefined,
  );
  const [swapStep, setSwapStep] = useState<"idle" | "swapping" | "done">("idle");
  const BASE_CHAIN_ID = IS_TESTNET ? 84532 : 8453;

  // Base-side ground truth while a bridge is in flight: a USDC balance
  // increase means the CCTP mint landed even if the backend status lags.
  const { data: baseUsdcBalance } = useReadContract({
    address: SWAP_CONSTANTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    chainId: BASE_CHAIN_ID,
    query: {
      enabled: Boolean(address && burn.burnTxid && bridgeStep !== "done"),
      refetchInterval: 8_000,
    },
  });
  const baseUsdcBaselineRef = useRef<bigint | null>(null);
  const baseBaselineTxRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      burn.burnTxid &&
      baseBaselineTxRef.current !== burn.burnTxid &&
      typeof baseUsdcBalance === "bigint"
    ) {
      baseBaselineTxRef.current = burn.burnTxid;
      baseUsdcBaselineRef.current = baseUsdcBalance;
    }
  }, [burn.burnTxid, baseUsdcBalance]);
  const baseReceived =
    baseUsdcBaselineRef.current !== null &&
    typeof baseUsdcBalance === "bigint" &&
    baseUsdcBalance > baseUsdcBaselineRef.current;

  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const wagmiConfig = useConfig();

  const parsed = amount ? parseFormattedNumber(amount) : 0;
  const amountValid = parsed > 0;
  // Peg-out economics: flat ≈2 USDC fee deducted before Circle attests, and the
  // contract rejects burns below 4.80 USDCx (`get-min-withdrawal-amount`).
  const receivedNet = Math.max(parsed - PEG_OUT_FEE_USDC, 0);
  const redeemValid = amountValid && parsed >= PEG_OUT_MIN_USDCX;
  /** What actually arrives on Ethereum and gets bridged: real balance delta
   *  when we observed the payout, otherwise amount minus the peg-out fee. */
  const bridgeAmountStr =
    typeof ethUsdcBalance === "bigint" &&
    ethUsdcBaselineRef.current !== null &&
    ethUsdcBalance > ethUsdcBaselineRef.current
      ? formatUnits(ethUsdcBalance - ethUsdcBaselineRef.current, 6)
      : receivedNet > 0
        ? receivedNet.toFixed(6)
        : "";

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setAmount(v === "" ? "" : formatNumber(v));
  };

  const settled =
    withdrawalInfo?.status === "finalized" || ethSettled;
  const withdrawFailed =
    withdrawalInfo?.status === "failed" || withdrawalInfo?.status === "expired";

  // Track bridge completion: backend status, the BridgeKit result itself, or
  // a Base-side balance increase — any of them means the mint landed.
  // Gated on bridgeReference so a stale success from a previous attempt can
  // never complete a freshly started bridge (executeBridge resets that state).
  const bridgeDone =
    bridgeStep === "bridging" &&
    bridgeReference !== undefined &&
    (bridgeStatus?.status === "COMPLETED" ||
      bridgeResult?.state === "success" ||
      baseReceived);
  const bridgeChainRestoredRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (bridgeDone) {
      setBridgeStep("done");
      // Settlement is done — bring the wallet back to Base so the user
      // isn't left stuck on Ethereum for their next swap.
      // Guarded by ref so refetches of the same completed bridge can never
      // fire a second network-switch prompt.
      if (
        bridgeReference &&
        bridgeChainRestoredRef.current !== bridgeReference
      ) {
        bridgeChainRestoredRef.current = bridgeReference;
        switchChainAsync({
          chainId: BASE_CHAIN_ID,
        }).catch(() => {
          // user can switch manually
        });
      }
    }
    if (bridgeStatus?.status === "FAILED") {
      setBridgeStep("idle");
      setBridgeReference(undefined);
    }
  }, [bridgeDone, bridgeStatus, bridgeReference, switchChainAsync, BASE_CHAIN_ID]);

  // ---- REDEEM: burn USDCx on Stacks, USDC lands on EVM wallet (Sepolia)
  const handleRedeem = async () => {
    if (!isConnected || !address) return;
    if (!isStacksConnected || !stacksAddress) {
      await connectStacks();
      return;
    }
    if (!redeemValid) return;
    const txid = await burn.burn({
      amount: amount.replace(/,/g, ""),
      evmRecipient: address as `0x${string}`,
      stacksSender: stacksAddress,
    });
    // NOTE: no chain switch here — the burn happens on Stacks and the EVM
    // wallet is only needed later (bridge step switches only when clicked).
    return txid;
  };

  // ---- After settlement: bridge the net USDC (amount minus peg-out fee) to Base
  const handleBridgeToBase = async () => {
    if (!address || !bridgeAmountStr) return;
    setBridgeStep("bridging");
    setBridgeReference(undefined);
    try {
      const outcome = await executeBridge(
        {
          fromChain: BRIDGE_FROM_CHAIN,
          toChain: BRIDGE_TO_CHAIN,
          amount: bridgeAmountStr,
          recipientAddress: address,
        },
        setBridgeReference,
      );
      if (outcome?.reference) setBridgeReference(outcome.reference);
      if (outcome?.state === "success") {
        setBridgeStep("done");
        if (outcome.reference && bridgeChainRestoredRef.current !== outcome.reference) {
          bridgeChainRestoredRef.current = outcome.reference;
          switchChainAsync({ chainId: BASE_CHAIN_ID }).catch(() => {});
        }
      } else if (!outcome) {
        setBridgeStep("idle");
      }
      // state === "pending" stays "bridging" — completion comes from the
      // status poll or the Base balance check in the effect above.
    } catch {
      setBridgeStep("idle");
    }
  };

  // ---- After bridge: optional 0x swap USDC -> CNGN on Base
  const handleSwapToCngn = async () => {
    if (!address || !bridgeAmountStr) return;
    setSwapStep("swapping");
    const targetChainId = BASE_CHAIN_ID;
    try {
      // Writes below are chainId-scoped — make sure the wallet is on Base first.
      await switchChainAsync({ chainId: targetChainId }).catch(() => {});
      const amountIn = parseUnits(bridgeAmountStr, SWAP_CONSTANTS.USDC_DECIMALS);
      const fetchQuote = async () => {
        const res = await axios.get("/api/swap/permit2-quote", {
          params: {
            sellToken: SWAP_CONSTANTS.USDC,
            buyToken: SWAP_CONSTANTS.CNGN,
            sellAmount: amountIn.toString(),
            taker: address,
            slippagePercentage: 0.05,
            chainId: targetChainId,
          },
        });
        return res.data;
      };

      let quote = await fetchQuote();
      if (!quote?.transaction) throw new Error("No swap quote available");

      if (quote.issues?.allowance) {
        const approveHash = await writeContractAsync({
          address: SWAP_CONSTANTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [quote.issues.allowance.spender as `0x${string}`, maxUint256],
          chainId: targetChainId,
        });
        await waitForTransactionReceipt(wagmiConfig, {
          hash: approveHash,
          chainId: targetChainId,
        });
        quote = await fetchQuote();
        if (!quote?.transaction) throw new Error("Failed to refresh swap quote");
      }

      let txData = quote.transaction.data as `0x${string}`;
      if (quote.permit2?.eip712) {
        const { domain, types, message, primaryType } = quote.permit2.eip712;
        const cleanTypes = { ...types } as Record<string, unknown>;
        // Strip EIP712Domain — wagmi derives it from `domain` internally.
        delete cleanTypes.EIP712Domain;
        const signature = await signTypedDataAsync({
          domain,
          types: cleanTypes,
          primaryType,
          message,
        } as unknown as Parameters<typeof signTypedDataAsync>[0]);
        txData = concat([txData, signature]) as `0x${string}`;
      }

      await sendTransactionAsync({
        account: address as `0x${string}`,
        to: quote.transaction.to as `0x${string}`,
        data: txData,
        value:
          quote.transaction.value && hexToBigInt(quote.transaction.value) > 0n
            ? hexToBigInt(quote.transaction.value)
            : 0n,
        chainId: targetChainId,
      });
      setSwapStep("done");
    } catch (e) {
      console.error("USDC->CNGN swap failed:", e);
      setSwapStep("idle");
    }
  };

  // ---- DEPOSIT: Base/Sepolia USDC -> USDCx on Stacks
  const handleDeposit = async () => {
    if (!isConnected || !address) return;
    if (!isStacksConnected || !stacksAddress) {
      await connectStacks();
      return;
    }
    if (!amountValid || !isStacksAddress(stacksAddress)) return;
    await xreserve.deposit({
      amount: amount.replace(/,/g, ""),
      stacksRecipient: stacksAddress,
      sourceChainId,
    });
  };

  const busy =
    burn.status === "awaiting-wallet" ||
    burn.status === "broadcasted" ||
    xreserve.isBusy;

  return (
    <div className="space-y-4">

      {/* ── Info banner ── */}
      <div className="flex items-start gap-2 p-3 bg-white/5 border border-white/10 rounded-xl">
        <Info className="w-4 h-4 text-white/50 mt-0.5 shrink-0" />
        <div className="text-[11px] leading-relaxed text-white/60 space-y-1.5">
          {direction === "redeem" ? (
            <p>
              Burn <strong className="text-white/80">USDCx on Stacks</strong> → receive{" "}
              <strong className="text-white/80">USDC</strong> on {ETH_NETWORK_LABEL} via Circle xReserve
              (flat ≈{PEG_OUT_FEE_USDC} USDC peg-out fee) → bridge to Base. Auto-swap to CNGN available after.
            </p>
          ) : (
            <p>
              Deposit <strong className="text-white/80">USDC</strong> from{" "}
              <strong className="text-white/80">{sourceChainLabels}</strong> → mint{" "}
              <strong className="text-white/80">USDCx on Stacks</strong> via Circle xReserve.
            </p>
          )}
        </div>
      </div>

      {/* ── Chain selectors ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* FROM */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-white/30 font-bold px-1">From</p>
          {direction === "deposit" ? (
            <ChainSelector
              chain={sourceChain.key}
              label="Source chain"
              onClick={() => setIsSourceChainModalOpen(true)}
            />
          ) : (
            /* Redeem: source is Stacks — locked */
            <div className="flex items-center gap-3 px-4 h-[64px] rounded-xl border border-white/10 bg-white/5 w-full">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/40 shrink-0">
                STX
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">Stacks</div>
                <div className="text-[10px] text-white/30">{NETWORK_LABEL}</div>
              </div>
              <Lock className="w-3 h-3 text-white/20 shrink-0" />
            </div>
          )}
        </div>

        {/* TO */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-white/30 font-bold px-1">To</p>
          {direction === "deposit" ? (
            /* Deposit: destination is Stacks — locked */
            <div className="flex items-center gap-3 px-4 h-[64px] rounded-xl border border-white/10 bg-white/5 w-full">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/40 shrink-0">
                STX
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">Stacks</div>
                <div className="text-[10px] text-white/30">{NETWORK_LABEL}</div>
              </div>
              <Lock className="w-3 h-3 text-white/20 shrink-0" />
            </div>
          ) : (
            /* Redeem: destination is the active Ethereum chain — locked */
            <div className="flex items-center gap-3 px-4 h-[64px] rounded-xl border border-white/10 bg-white/5 w-full">
              <ChainSelector
                chain={IS_TESTNET ? "sepolia" : "ethereum"}
                label={ETH_NETWORK_LABEL}
              />
              <Lock className="w-3 h-3 text-white/20 shrink-0 -ml-2" />
            </div>
          )}
        </div>
      </div>

      {/* Source chain selection modal (deposit only) */}
      <ChainSelectionModal
        open={isSourceChainModalOpen}
        onOpenChange={setIsSourceChainModalOpen}
        selectedChain={sourceChain.key}
        chains={XRESERVE_SUPPORTED_SOURCE_CHAINS.map((c) => c.key)}
        onSelect={(key) => {
          const found = XRESERVE_SUPPORTED_SOURCE_CHAINS.find((c) => c.key === key);
          if (found) setSourceChainId(found.chainId);
          setIsSourceChainModalOpen(false);
        }}
      />

      {/* ── Stacks wallet — connect prompt or connected address ── */}
      {!isStacksConnected ? (
        <div className="flex items-center justify-between gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <ShieldCheck className="w-4 h-4 text-white/50 shrink-0" />
            <span>Connect Leather or Xverse to {direction === "redeem" ? "burn" : "receive"} USDCx</span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => connectStacks()}
            disabled={isConnecting}
            className="bg-secondary text-black hover:bg-secondary/90 rounded-lg text-xs font-semibold h-8 shrink-0"
          >
            {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect Stacks"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 p-3 bg-white/5 border border-white/10 rounded-xl text-xs">
          <span className="text-white/50 shrink-0">Stacks wallet</span>
          <span className="font-mono text-white/80 truncate">{stacksAddress}</span>
          <button
            type="button"
            onClick={() => disconnectStacks()}
            className="text-white/40 hover:text-white/70 underline shrink-0"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* ── Amount input ── */}
      <SwapSection
        label={direction === "redeem" ? "You'll burn (USDCx on Stacks)" : `You'll send (${sourceChain.label} USDC)`}
        amount={amount}
        onAmountChange={handleAmountChange}
        currencyType="USDCX"
        onCurrencyClick={undefined}
      />

      {/* ── Peg-out fee preview (redeem only) ── */}
      {direction === "redeem" && (
        <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-white/50">Peg-out fee (≈)</span>
            <span className="text-white/80">{PEG_OUT_FEE_USDC} USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/50">
              You receive on {ETH_NETWORK_LABEL}
            </span>
            <span className="text-white font-semibold">
              {amountValid ? `≈ ${receivedNet.toFixed(2)} USDC` : "—"}
            </span>
          </div>
          {amountValid && parsed < PEG_OUT_MIN_USDCX && (
            <p className="text-yellow-400/90 pt-0.5">
              Minimum burn is {PEG_OUT_MIN_USDCX} USDCx.
            </p>
          )}
        </div>
      )}

      {/* ── Redeem progress: one card for every leg (burn → payout → bridge → swap) ── */}
      {direction === "redeem" && burn.burnTxid && (
        <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-3 text-[11px]">
          {/* 1. Burn on Stacks */}
          <div className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span className="text-white/70 flex-1">Burn confirmed on Stacks</span>
            <a
              href={`${STX_TX_BASE}${burn.burnTxid}?chain=${STACKS_EXPLORER_CHAIN}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-white/50 hover:text-white/80"
            >
              {burn.burnTxid.slice(0, 12)}… <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>

          {/* 2. Payout on Ethereum */}
          <div className="flex items-center gap-2">
            {settled ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400 shrink-0" />
            )}
            <span className={`flex-1 ${settled ? "text-white/70" : "text-yellow-300/80"}`}>
              {settled
                ? `USDC received on ${ETH_NETWORK_LABEL}`
                : withdrawFailed
                  ? "Withdrawal failed"
                  : "Waiting for Circle attestation…"}
            </span>
            {withdrawalInfo?.transactionHash && (
              <a
                href={`${ETHSCAN_TX_BASE}${withdrawalInfo.transactionHash}`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-white/50 hover:text-white/80"
              >
                {withdrawalInfo.transactionHash.slice(0, 12)}… <ArrowUpRight className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* 3. Bridge Ethereum → Base */}
          <div className="flex items-center gap-2">
            {bridgeStep === "done" ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
            ) : bridgeStep === "bridging" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
            )}
            <span
              className={`flex-1 ${
                bridgeStep === "done"
                  ? "text-white/70"
                  : bridgeStep === "bridging"
                    ? "text-yellow-300/80"
                    : "text-white/50"
              }`}
            >
              {bridgeStep === "done"
                ? "USDC on Base"
                : bridgeStep === "bridging"
                  ? `Bridging ${ETH_NETWORK_LABEL} → Base…`
                  : `Bridge ${ETH_NETWORK_LABEL} → Base`}
            </span>
            {settled && bridgeStep === "idle" && (
              <Button
                type="button"
                size="sm"
                onClick={handleBridgeToBase}
                disabled={isBridging || !bridgeAmountStr}
                className="bg-secondary text-black hover:bg-secondary/90 rounded-lg text-xs font-semibold h-7 px-3 shrink-0"
              >
                {isBridging ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Bridging…
                  </span>
                ) : (
                  `Bridge ≈${bridgeAmountStr ? Number(bridgeAmountStr).toFixed(2) : ""} USDC`
                )}
              </Button>
            )}
          </div>
          {bridgeStep === "bridging" && (
            <p className="text-yellow-300/70 pl-5 -mt-1 leading-relaxed">
              Confirm the transactions in your wallet — the mint lands on Base
              in ~15-20 minutes.
            </p>
          )}

          {/* 4. Optional swap on Base */}
          {receiveToken === "CNGN" && (
            <div className="flex items-center gap-2">
              {swapStep === "done" ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
              ) : swapStep === "swapping" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400 shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
              )}
              <span
                className={`flex-1 ${
                  swapStep === "done"
                    ? "text-white/70"
                    : swapStep === "swapping"
                      ? "text-yellow-300/80"
                      : bridgeStep === "done"
                        ? "text-white/50"
                        : "text-white/30"
                }`}
              >
                {swapStep === "done"
                  ? "CNGN received"
                  : swapStep === "swapping"
                    ? "Swapping USDC → CNGN…"
                    : "Swap USDC → CNGN on Base"}
              </span>
              {bridgeStep === "done" && swapStep === "idle" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSwapToCngn}
                  className="bg-secondary text-black hover:bg-secondary/90 rounded-lg text-xs font-semibold h-7 px-3 shrink-0"
                >
                  Swap now
                </Button>
              )}
            </div>
          )}
          {swapStep === "swapping" && (
            <p className="text-yellow-300/70 pl-5 -mt-1 leading-relaxed">
              Confirm the swap in your wallet.
            </p>
          )}

          {/* Final state */}
          {bridgeStep === "done" && (receiveToken === "USDC" || swapStep === "done") && (
            <div className="pt-2.5 border-t border-white/10 flex items-center gap-1.5 text-green-400">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {receiveToken === "CNGN" && swapStep === "done"
                  ? "Done — CNGN sent to your wallet"
                  : "Done — USDC is in your wallet on Base"}
              </span>
            </div>
          )}
        </div>
      )}

      {direction === "redeem" && (withdrawFailed || burn.error) && (
        <div className="space-y-2 text-[11px]">
          {withdrawFailed && (
            <p className="text-red-400">
              Withdrawal {withdrawalInfo?.status}{withdrawalInfo?.failureReason ? `: ${withdrawalInfo.failureReason}` : ""} — retry with a fresh burn.
            </p>
          )}
          {burn.error && <p className="text-red-400">{burn.error}</p>}
        </div>
      )}

      {/* ── Deposit status ── */}
      {direction === "deposit" && xreserve.depositHash && (
        <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-3 text-[11px]">
          <div className="flex items-center justify-between text-white/60">
            <span>Deposit tx</span>
            <a
              href={`${ETHSCAN_TX_BASE}${xreserve.depositHash}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 hover:text-white/80"
            >
              {xreserve.depositHash.slice(0, 12)}… <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>

          {(xreserve.status === "minting" || xreserve.status === "mint-delayed" || xreserve.status === "done") && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                <span>Deposit confirmed on {sourceChain.label}</span>
              </div>

              <div className="flex items-center gap-2 text-white/70">
                {xreserve.depositStatus?.status === "attested" || xreserve.depositStatus?.status === "relayed" || xreserve.status === "done" ? (
                  <><CheckCircle className="w-3.5 h-3.5 text-green-400" /><span>Attested by Circle</span></>
                ) : (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400" /><span>Waiting for Circle attestation</span></>
                )}
              </div>

              <div className="flex items-center gap-2 text-white/70">
                {xreserve.status === "done" ? (
                  <><CheckCircle className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">USDCx minted on Stacks</span></>
                ) : xreserve.status === "mint-delayed" ? (
                  <><RefreshCw className="w-3.5 h-3.5 text-yellow-400" /><span className="text-yellow-300/80">Relay not landed yet</span></>
                ) : (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" /><span className="text-blue-300/80">Minting USDCx on Stacks (~15 min)</span></>
                )}
              </div>

              {xreserve.mintRecipient && (
                <a
                  href={`https://explorer.hiro.so/address/${xreserve.mintRecipient}?chain=${STACKS_EXPLORER_CHAIN}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-white/50 hover:text-white/80 pt-0.5"
                >
                  Stacks: {xreserve.mintRecipient.slice(0, 10)}… <ArrowUpRight className="w-3 h-3" />
                </a>
              )}

              {xreserve.status === "mint-delayed" && (
                <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-2">
                  <p className="text-yellow-300/80 leading-relaxed">
                    Circle attested the deposit but the Stacks relay has not minted yet — your USDC is safe.
                  </p>
                  <Button type="button" size="sm" onClick={() => xreserve.recheckMint?.()}
                    className="w-full h-8 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold">
                    Check again
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Action button ── */}
      <Button
        type="button"
        disabled={
          !isConnected ||
          (direction === "redeem" ? !redeemValid : !amountValid) ||
          busy
        }
        onClick={direction === "redeem" ? handleRedeem : handleDeposit}
        className="w-full h-14 bg-secondary text-black hover:bg-secondary/90 rounded-xl font-bold disabled:opacity-50"
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {direction === "redeem"
              ? burn.status === "awaiting-wallet" ? "Confirm in Stacks wallet…" : "Broadcasting burn…"
              : xreserve.status === "approving" ? "Approving USDC…"
              : xreserve.status === "depositing" ? "Confirm deposit…"
              : xreserve.status === "minting"
                ? xreserve.depositStatus?.status === "attested" ? "Attested — relay pending…" : "Waiting for Circle attestation…"
              : xreserve.status === "mint-delayed" ? "Mint delayed — check again"
              : "Confirming…"}
          </span>
        ) : !isConnected ? "Connect wallet"
          : !isStacksConnected ? "Connect Stacks wallet"
          : direction === "redeem" ? "Burn USDCx → USDC"
          : `Deposit USDC → USDCx via ${sourceChain.label}`}
      </Button>
    </div>
  );
}
