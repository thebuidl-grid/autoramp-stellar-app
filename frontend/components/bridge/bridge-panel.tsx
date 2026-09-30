"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ChainSelect } from "./chain-select";
import { QrCode } from "./qr-code";
import { QrScanButton } from "./qr-scan-button";
import { WalletPicker, CHAIN_LABELS } from "./wallet-picker";
import { useStellarWallet } from "@/lib/hooks/use-stellar-wallet";
import { useEvmWallet } from "@/lib/hooks/use-evm-wallet";
import {
  useBridgeChains,
  useChainTokens,
  useCreateBridgeTransfer,
  useBuildBridgeBurnTransaction,
  useRegisterBridgeBurn,
  useBridgeTransferStatus,
  useBridgeUsdcBalance,
  useBuildDestinationSwap,
} from "@/lib/hooks/use-bridge";
import { useCorridors, useSwapQuote } from "@/lib/hooks/use-swap";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { submitSignedXdr } from "@/lib/stellar-tx";
import { waitForReceipt } from "@/lib/evm-tx";
import { copyToClipboard } from "@/lib/utils";
import { CheckCircle, Copy, Loader2 } from "lucide-react";
import type { CreateBridgeTransferResponse } from "@/lib/api";
import { useTransactionStore } from "@/lib/store";

/** Same check page.tsx's Buy/Sell/Swap flow uses — a connected wallet is not an AutoRamp login. */
function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("token");
}

type BridgeMode = "receive" | "send" | "swap";

/**
 * Shared "kick off a transfer" logic used by Send and Swap (and, from the
 * main Buy/Sell/Swap page, a cross-chain Sell) — self-custodial for both
 * wallet types.
 */
export function useExecuteTransfer(onReady: (reference: string, response: CreateBridgeTransferResponse) => void) {
  const { toast } = useToast();
  const { signTransaction } = useStellarWallet();
  const evm = useEvmWallet();
  const createTransfer = useCreateBridgeTransfer();
  const buildBurnTransaction = useBuildBridgeBurnTransaction();
  const registerBurn = useRegisterBridgeBurn();
  const [isSigning, setIsSigning] = useState(false);

  const execute = (params: Parameters<typeof createTransfer.mutate>[0]) => {
    createTransfer.mutate(params, {
      onSuccess: async (response) => {
        const {
          reference,
          approveTransactionXdr,
          approveTransaction,
          burnTransaction,
          sourceSwapApproveTransaction,
          sourceSwapTransaction,
        } = response.data;

        if (approveTransactionXdr) {
          setIsSigning(true);
          try {
            // Two sequential Stellar transactions, not one — a Soroban
            // transaction can only carry one contract invocation, so
            // approve() and deposit_for_burn() can't be batched. Horizon's
            // submit is synchronous (confirms on-chain before resolving),
            // so the burn transaction can only be built (simulated) after
            // the approve is actually confirmed — hence the extra
            // buildBurnTransaction round-trip here, unlike the EVM branch
            // below where both txs are ready up front.
            const signedApprove = await signTransaction(approveTransactionXdr);
            await submitSignedXdr(signedApprove);

            const burnBuild = await buildBurnTransaction.mutateAsync({ reference, sourceAddress: params.sourceAddress! });
            const signedXdr = await signTransaction(burnBuild.data.burnTransactionXdr);
            const hash = await submitSignedXdr(signedXdr);
            await registerBurn.mutateAsync({ reference, burnTxHash: hash });
            onReady(reference, response.data);
          } catch (error: any) {
            toast({
              title: "Failed to sign/submit burn",
              description: error?.message || "Please try again",
              variant: "destructive",
            });
          } finally {
            setIsSigning(false);
          }
          return;
        }

        if (approveTransaction && burnTransaction) {
          setIsSigning(true);
          try {
            // Multi-stablecoin bridge-in: two extra transactions ahead of
            // the usual approve/burn — approve the source token to 0x's
            // allowance target, then submit 0x's swap calldata to convert
            // it to USDC. Only present when sourceTokenCode wasn't USDC.
            if (sourceSwapApproveTransaction && sourceSwapTransaction) {
              const swapApproveHash = await evm.sendTransaction(sourceSwapApproveTransaction);
              await waitForReceipt(swapApproveHash);
              const swapHash = await evm.sendTransaction(sourceSwapTransaction);
              await waitForReceipt(swapHash);
            }

            const approveHash = await evm.sendTransaction(approveTransaction);
            await waitForReceipt(approveHash);
            const burnHash = await evm.sendTransaction(burnTransaction);
            await registerBurn.mutateAsync({ reference, burnTxHash: burnHash });
            onReady(reference, response.data);
          } catch (error: any) {
            toast({
              title: "Failed to submit approve/burn",
              description: error?.message || "Please try again",
              variant: "destructive",
            });
          } finally {
            setIsSigning(false);
          }
        }
      },
      onError: (error: any) => {
        toast({
          title: "Failed to start transfer",
          description: error?.response?.data?.message || "Please try again",
          variant: "destructive",
        });
      },
    });
  };

  return { execute, isBusy: createTransfer.isPending || isSigning, isSigning };
}

function StatusCard({ reference }: { reference: string }) {
  const { data: status } = useBridgeTransferStatus(reference, true);
  if (!status) return null;
  const isTerminal = status.status === "COMPLETED" || status.status === "FAILED" || status.status === "PAYOUT_HELD";

  return (
    <div className="p-4 bg-black/50 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-white/70">Status</span>
        <span className="text-white font-medium flex items-center gap-2">
          {!isTerminal && <Loader2 className="w-4 h-4 animate-spin text-secondary" />}
          {status.status}
        </span>
      </div>
      {status.mintTxHash && (
        <div className="flex justify-between">
          <span className="text-white/70">Mint tx</span>
          <code className="text-xs text-white/70 break-all">{status.mintTxHash}</code>
        </div>
      )}
      {status.payoutTxHash && (
        <div className="flex justify-between">
          <span className="text-white/70">Payout tx</span>
          <code className="text-xs text-white/70 break-all">{status.payoutTxHash}</code>
        </div>
      )}
      {status.status === "FAILED" && status.errorMessage && (
        <p className="text-sm text-red-400">{status.errorMessage}</p>
      )}
      {status.status === "PAYOUT_HELD" && (
        <div className="space-y-1">
          <p className="text-sm text-amber-400">
            The bridge itself completed, but the payout rate moved beyond our tolerance while your transfer was confirming — it&apos;s on hold for manual review rather than paying out less than expected.
          </p>
          {status.errorMessage && <p className="text-xs text-white/50">{status.errorMessage}</p>}
        </div>
      )}
      {status.status === "COMPLETED" && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle size={16} /> Transfer complete
        </div>
      )}
    </div>
  );
}

function BalanceHint({ chain, address }: { chain: string; address: string | undefined }) {
  const { data, isLoading } = useBridgeUsdcBalance(chain, address);
  if (!address) return null;
  return (
    <p className="text-xs text-white/50">
      {isLoading ? "Checking balance..." : data ? `Balance: ${data.balance} USDC` : null}
    </p>
  );
}

/** Chain picker for the manual-destination fallback — fetches its own chain list so callers don't need to thread it through. */
function ManualChainSelect({
  value,
  onValueChange,
  excludeChain,
}: {
  value: string | null;
  onValueChange: (chain: string) => void;
  excludeChain: string | null;
}) {
  const { data: chains = [] } = useBridgeChains();
  return (
    <ChainSelect
      label="Chain"
      chains={chains}
      value={value ?? ""}
      onValueChange={onValueChange}
      excludeChain={excludeChain ?? undefined}
    />
  );
}

/**
 * Receive: connect the wallet you want to receive into and we show its
 * address as a QR/copyable string — purely client-side, reads straight from
 * the wallet extension. Nothing here ever touches the backend: unlike the
 * old custodial "deposit address" flow, funds sent to this address land
 * directly in the user's own wallet, so there's nothing to register or
 * track until they actually decide to send/swap it elsewhere.
 */
/**
 * Receiving is always into a Stellar address — that's the only chain CCTP
 * ever mints onto. There's no chain to pick here: whoever's paying you
 * chooses their OWN source chain (Stellar, Base, or Ethereum) when they
 * send, and the bridge's burn-then-mint flow credits it here automatically
 * as Stellar USDC regardless of which one they used. Showing an EVM
 * address here (as an earlier version did, via the generic multi-chain
 * WalletPicker) would be actively wrong — plain USDC sent to a Base/
 * Ethereum address never gets bridged, it just sits there unbridged.
 */
function ReceiveTab() {
  const stellar = useStellarWallet();
  const [copied, setCopied] = useState(false);

  if (!stellar.address) {
    return (
      <div className="p-6 rounded-xl bg-black/50 border border-white/10 text-center space-y-3">
        <p className="text-sm text-white/70">
          Connect your Stellar wallet — we&apos;ll show its address so anyone can send you USDC, from Stellar, Base, or
          Ethereum.
        </p>
        <div className="flex justify-center">
          <Button type="button" size="sm" isLoading={stellar.isConnecting} onClick={stellar.connect}>
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <QrCode value={stellar.address} />
      <div className="p-4 bg-black/50 rounded-xl space-y-2">
        <span className="text-xs text-white/50 uppercase tracking-wide">Your Stellar address</span>
        <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/10">
          <code className="text-xs text-white flex-1 break-all font-mono">{stellar.address}</code>
          <button
            onClick={async () => {
              const success = await copyToClipboard(stellar.address as string);
              if (success) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="p-2 hover:bg-white/10 rounded-md transition-colors"
          >
            {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} className="text-white/50" />}
          </button>
        </div>
        <p className="text-xs text-white/50">Share this address with anyone paying you.</p>
      </div>
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
        <p className="text-xs text-amber-400 font-medium">Paying from Base or Ethereum?</p>
        <p className="text-xs text-white/70">
          Don&apos;t send a plain USDC transfer — it won&apos;t bridge, and the funds will stay on that chain. Send it
          through a CCTP-enabled app instead (this app&apos;s own Send tab works), with the Stellar address above as the
          destination.
        </p>
      </div>
      <Button type="button" onClick={() => stellar.disconnect()} className="w-full h-12 bg-white/10 hover:bg-white/20 text-white">
        Use a different wallet
      </Button>
    </div>
  );
}

/** Send: connect the source wallet (auto-detects chain + shows balance), connect or paste the destination, review, confirm, send. */
function SendTab() {
  const { toast } = useToast();
  const setIsAuthModalOpen = useTransactionStore((state) => state.setIsAuthModalOpen);
  const [sourceChain, setSourceChain] = useState<string | null>(null);
  const [sourceAddress, setSourceAddress] = useState<string | null>(null);
  const [sourceWalletType, setSourceWalletType] = useState<"evm" | "stellar" | null>(null);
  const [destinationWalletType, setDestinationWalletType] = useState<"evm" | "stellar" | null>(null);
  const [manualSource, setManualSource] = useState(false);
  const [destinationChain, setDestinationChain] = useState<string | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [manualDestination, setManualDestination] = useState(false);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [reference, setReference] = useState<string | undefined>(undefined);

  const { execute, isBusy, isSigning } = useExecuteTransfer((ref) => {
    setReference(ref);
  });

  const goToReview = () => {
    // Bridging is self-custodial (only your own wallet ever signs), but
    // POST /bridge/transfers still requires an AutoRamp login — same as
    // the Swap tab — mainly so a transfer can be tied to a user for
    // History. Catch this before the review step, not after the user's
    // already reviewed and hit Confirm, where it previously surfaced as a
    // bare "Authentication required" failure with no path forward.
    if (!isLoggedIn()) {
      toast({ title: "Please log in to continue", description: "You'll come back here once you're signed in.", variant: "destructive" });
      setIsAuthModalOpen(true);
      return;
    }
    if (!sourceChain) {
      toast({ title: "Connect the wallet you're sending from, or pick a chain", variant: "destructive" });
      return;
    }
    if (sourceChain === "stellar" && !sourceAddress) {
      toast({ title: "Connect your Stellar wallet first", variant: "destructive" });
      return;
    }
    if (!destinationChain || !destinationAddress) {
      toast({ title: "Connect a destination wallet or enter an address", variant: "destructive" });
      return;
    }
    if (sourceChain === destinationChain) {
      toast({ title: "Source and destination must be different chains", variant: "destructive" });
      return;
    }
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setStep("review");
  };

  const confirmSend = () => {
    execute({
      sourceChain: sourceChain as string,
      destinationChain: destinationChain as string,
      destinationAddress,
      expectedAmount: parseFloat(amount),
      sourceAddress: sourceAddress ?? undefined,
    });
  };

  if (reference) {
    return (
      <div className="space-y-4">
        <StatusCard reference={reference} />
        <Button
          type="button"
          onClick={() => {
            setReference(undefined);
            setStep("form");
            setAmount("");
          }}
          className="w-full h-12"
        >
          New transfer
        </Button>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-black/50 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-white/50 uppercase tracking-wide block">You send</span>
              <span className="text-white font-semibold text-lg">{amount} USDC</span>
              <span className="text-xs text-white/50 block">on {sourceChain}</span>
            </div>
            <span className="text-white/30 text-xl">→</span>
            <div className="text-right">
              <span className="text-xs text-white/50 uppercase tracking-wide block">You&apos;ll receive</span>
              <span className="text-white font-semibold text-lg">{amount} USDC</span>
              <span className="text-xs text-white/50 block">on {destinationChain}</span>
            </div>
          </div>
          <div className="border-t border-white/10 pt-3 flex justify-between items-start">
            <span className="text-white/70 shrink-0 text-sm">Destination address</span>
            <code className="text-xs text-white break-all text-right ml-4">{destinationAddress}</code>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => setStep("form")} className="flex-1 h-12 bg-white/10 hover:bg-white/20 text-white">
            Back
          </Button>
          <Button type="button" onClick={confirmSend} isLoading={isBusy} className="flex-1 h-12">
            {isSigning ? "Waiting for signature..." : "Confirm & Send"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-white">Sending from</label>
          <button
            type="button"
            onClick={() => {
              setManualSource((v) => !v);
              setSourceChain(null);
              setSourceAddress(null);
              setSourceWalletType(null);
            }}
            className="text-xs text-white/50 hover:text-white/80"
          >
            {manualSource ? "Connect a wallet instead" : "Pick a chain manually"}
          </button>
        </div>

        {manualSource ? (
          <ManualChainSelect value={sourceChain} onValueChange={setSourceChain} excludeChain={destinationChain} />
        ) : (
          <WalletPicker
            excludeType={destinationWalletType}
            onResolved={(chain, address, walletType) => {
              setSourceChain(chain);
              setSourceAddress(address);
              setSourceWalletType(walletType);
            }}
            onDisconnect={() => {
              setSourceChain(null);
              setSourceAddress(null);
              setSourceWalletType(null);
            }}
          />
        )}
        {/* Balance reads automatically the moment a chain/wallet is
            picked — sits right under the picker itself (like a token
            selector's own balance readout), not in a separate summary
            panel disconnected from the thing it's describing. */}
        {sourceChain && <BalanceHint chain={sourceChain} address={sourceAddress ?? undefined} />}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-white">Amount (USDC)</label>
        <Input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-14 bg-black/50! border-white/10 text-white placeholder:text-white/30 border-0! outline-0!"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-white">Destination</label>
          <button
            type="button"
            onClick={() => setManualDestination((v) => !v)}
            className="text-xs text-white/50 hover:text-white/80"
          >
            {manualDestination ? "Connect a wallet instead" : "Enter address manually"}
          </button>
        </div>

        {manualDestination ? (
          <div className="space-y-2">
            <ManualChainSelect value={destinationChain} onValueChange={setDestinationChain} excludeChain={sourceChain} />
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="G... or 0x..."
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                className="h-14 bg-black/50! border-white/10 text-white placeholder:text-white/30 border-0! outline-0! flex-1"
              />
              <QrScanButton onScan={setDestinationAddress} />
            </div>
          </div>
        ) : (
          <WalletPicker
            excludeType={sourceWalletType}
            onResolved={(chain, address, walletType) => {
              setDestinationChain(chain);
              setDestinationAddress(address);
              setDestinationWalletType(walletType);
            }}
            onDisconnect={() => {
              setDestinationChain(null);
              setDestinationAddress("");
              setDestinationWalletType(null);
            }}
          />
        )}
        {!manualDestination && destinationChain && (
          <BalanceHint chain={destinationChain} address={destinationAddress || undefined} />
        )}
      </div>

      <Button type="button" onClick={goToReview} className="w-full h-14 text-sm md:font-medium rounded-xl bg-secondary hover:bg-secondary/90 text-black">
        Review
      </Button>
    </div>
  );
}

/**
 * Bridge (labeled "Swap" internally — same BridgeMode key, just a
 * user-facing rename): stable-to-stable, any chain to any chain. Connect
 * the wallet holding the source stable, bridge it in as USDC, then either
 * leave it as USDC, convert to a Stellar corridor stablecoin (custodial,
 * no extra signature), or convert to any other registered stablecoin on
 * the destination EVM chain (self-custodial — one follow-up signature
 * once the bridge itself completes, since that leg can't be pre-signed).
 */
function SwapTab() {
  const { toast } = useToast();
  const setIsAuthModalOpen = useTransactionStore((state) => state.setIsAuthModalOpen);
  const { data: corridors = [] } = useCorridors();
  const [sourceChain, setSourceChain] = useState<string | null>(null);
  const [sourceAddress, setSourceAddress] = useState<string | null>(null);
  const [sourceWalletType, setSourceWalletType] = useState<"evm" | "stellar" | null>(null);
  const [sourceTokenCode, setSourceTokenCode] = useState("USDC");
  const [destinationChain, setDestinationChain] = useState("stellar");
  const [destinationWalletType, setDestinationWalletType] = useState<"evm" | "stellar" | null>(null);
  const [manualDestination, setManualDestination] = useState(false);
  const [receiveAs, setReceiveAs] = useState("USDC");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState<string | undefined>(undefined);

  const { execute, isBusy, isSigning } = useExecuteTransfer((ref) => setReference(ref));

  // Multi-stablecoin bridge-in: other stablecoins registered for the
  // connected chain get swapped to USDC (via 0x) ahead of the usual
  // approve+burn — see createTransferIntent. Stellar sources don't support
  // this yet, so the selector only matters for an EVM sourceChain.
  const { data: chainTokens = [] } = useChainTokens(sourceChain);
  const sourceTokenOptions = [{ tokenCode: "USDC" }, ...chainTokens];
  useEffect(() => {
    setSourceTokenCode("USDC");
  }, [sourceChain]);

  // "Receive as" is scoped to whichever chain is picked below — a Stellar
  // destination offers corridor stablecoins (custodial payout, no extra
  // signature); an EVM destination offers that chain's own registered
  // ChainTokens (self-custodial follow-up swap once the bridge completes).
  const { data: destinationChainTokens = [] } = useChainTokens(destinationChain !== "stellar" ? destinationChain : null);
  const receiveAsOptions =
    destinationChain === "stellar"
      ? [{ code: "USDC", label: "USDC (no conversion)" }, ...corridors.map((c) => ({ code: c.stablecoinCode, label: c.stablecoinCode }))]
      : [{ code: "USDC", label: "USDC (no conversion)" }, ...destinationChainTokens.map((t) => ({ code: t.tokenCode, label: t.tokenCode }))];
  useEffect(() => {
    setReceiveAs("USDC");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationChain]);

  // Live estimate of the payout leg — only meaningful for a Stellar
  // destination (SwapService.getSwapQuote only resolves Stellar-side
  // assets). An EVM destination's follow-up swap signs against a LIVE 0x
  // quote once the bridge completes instead — no pre-submission preview.
  const debouncedAmount = useDebouncedValue(amount, 400);
  const parsedAmountForQuote = parseFloat(debouncedAmount);
  const { data: payoutQuote, isFetching: isQuoteLoading } = useSwapQuote(
    receiveAs !== "USDC" && destinationChain === "stellar" ? "USDC" : undefined,
    receiveAs !== "USDC" && destinationChain === "stellar" ? receiveAs : undefined,
    Number.isFinite(parsedAmountForQuote) && parsedAmountForQuote > 0 ? parsedAmountForQuote : null,
  );

  // Once a submitted transfer completes, poll its status here too (React
  // Query dedupes this against StatusCard's own identical query) so this
  // component can detect "COMPLETED with a payoutTokenCode still pending a
  // self-custodial follow-up swap" and offer that step.
  const { data: transferStatus } = useBridgeTransferStatus(reference, !!reference);
  const buildDestinationSwap = useBuildDestinationSwap();
  const destinationEvmWallet = useEvmWallet();
  const [isFinishingSwap, setIsFinishingSwap] = useState(false);
  const needsDestinationSwap = transferStatus?.status === "COMPLETED" && !!transferStatus?.payoutTokenCode;

  const handleFinishDestinationSwap = async () => {
    if (!reference) return;
    setIsFinishingSwap(true);
    try {
      const response = await buildDestinationSwap.mutateAsync(reference);
      const approveHash = await destinationEvmWallet.sendTransaction(response.data.approveTransaction);
      await waitForReceipt(approveHash);
      const swapHash = await destinationEvmWallet.sendTransaction(response.data.swapTransaction);
      await waitForReceipt(swapHash);
      toast({
        title: "Swap complete",
        description: `Received ≈ ${response.data.estimatedOutput} ${transferStatus?.payoutTokenCode}`,
      });
    } catch (error: any) {
      toast({
        title: "Swap failed",
        description: error?.response?.data?.message || error?.message || "Please try again — your USDC is still safely in your wallet either way.",
        variant: "destructive",
      });
    } finally {
      setIsFinishingSwap(false);
    }
  };

  const handleSubmit = () => {
    if (!isLoggedIn()) {
      toast({ title: "Please log in to continue", description: "You'll come back here once you're signed in.", variant: "destructive" });
      setIsAuthModalOpen(true);
      return;
    }
    if (!sourceChain || !sourceAddress) {
      toast({ title: "Connect the wallet holding your USDC", variant: "destructive" });
      return;
    }
    if (sourceChain === destinationChain) {
      toast({ title: "Pick two different chains", variant: "destructive" });
      return;
    }
    if (!destinationAddress) {
      toast({ title: "Destination address required", variant: "destructive" });
      return;
    }
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }

    execute({
      sourceChain,
      destinationChain,
      destinationAddress,
      expectedAmount: parsed,
      sourceTokenCode: sourceTokenCode !== "USDC" ? sourceTokenCode : undefined,
      payoutStablecoinCode: receiveAs !== "USDC" && destinationChain === "stellar" ? receiveAs : undefined,
      payoutSlippage: receiveAs !== "USDC" && destinationChain === "stellar" ? 0.05 : undefined,
      payoutTokenCode: receiveAs !== "USDC" && destinationChain !== "stellar" ? receiveAs : undefined,
      sourceAddress: sourceAddress ?? undefined,
    });
  };

  if (reference) {
    return (
      <div className="space-y-4">
        <StatusCard reference={reference} />
        {needsDestinationSwap && (
          <div className="p-4 bg-black/50 rounded-xl space-y-3">
            <p className="text-sm text-white/70">
              USDC landed in your wallet on {transferStatus?.destinationChain}. Finish converting it to {transferStatus?.payoutTokenCode} — this needs one more signature from the wallet connected there.
            </p>
            <Button type="button" onClick={handleFinishDestinationSwap} isLoading={isFinishingSwap} className="w-full h-12">
              {isFinishingSwap ? "Waiting for signature..." : `Swap to ${transferStatus?.payoutTokenCode}`}
            </Button>
          </div>
        )}
        <Button type="button" onClick={() => { setReference(undefined); setAmount(""); }} className="w-full h-12">
          New swap
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-white">Bridging from</label>
        <WalletPicker
          onResolved={(chain, address, walletType) => {
            setSourceChain(chain);
            setSourceAddress(address);
            setSourceWalletType(walletType);
          }}
          onDisconnect={() => {
            setSourceChain(null);
            setSourceAddress(null);
            setSourceWalletType(null);
          }}
        />
        {sourceChain && <p className="text-xs text-white/50">Connected: {sourceChain}</p>}
      </div>

      {sourceTokenOptions.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Token</label>
          <Select value={sourceTokenCode} onValueChange={setSourceTokenCode}>
            <SelectTrigger>
              <SelectValue placeholder="Select a token" />
            </SelectTrigger>
            <SelectContent>
              {sourceTokenOptions.map((opt) => (
                <SelectItem key={opt.tokenCode} value={opt.tokenCode}>
                  {opt.tokenCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sourceTokenCode !== "USDC" && (
            <p className="text-xs text-white/50">Swapped to USDC before bridging — you'll sign one extra step for that.</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-white">Amount ({sourceTokenCode})</label>
        <Input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-14 bg-black/50! border-white/10 text-white placeholder:text-white/30 border-0! outline-0!"
        />
        {sourceTokenCode === "USDC" && <BalanceHint chain={sourceChain ?? ""} address={sourceAddress ?? undefined} />}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-white">Deliver to</label>
          <button
            type="button"
            onClick={() => setManualDestination((v) => !v)}
            className="text-xs text-white/50 hover:text-white/80"
          >
            {manualDestination ? "Connect a wallet instead" : "Enter address manually"}
          </button>
        </div>

        {manualDestination ? (
          <div className="space-y-2">
            <ManualChainSelect value={destinationChain} onValueChange={setDestinationChain} excludeChain={sourceChain} />
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={destinationChain === "stellar" ? "G..." : "0x..."}
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                className="h-14 bg-black/50! border-white/10 text-white placeholder:text-white/30 border-0! outline-0! flex-1"
              />
              <QrScanButton onScan={setDestinationAddress} />
            </div>
          </div>
        ) : (
          <WalletPicker
            // One Stellar connection and one EVM connection (single
            // injected provider) can exist at a time, so the same slot
            // can't be claimed by both source and destination.
            excludeType={sourceWalletType}
            onResolved={(chain, address, walletType) => {
              setDestinationChain(chain);
              setDestinationAddress(address);
              setDestinationWalletType(walletType);
            }}
            onDisconnect={() => {
              setDestinationChain("stellar");
              setDestinationAddress("");
              setDestinationWalletType(null);
            }}
          />
        )}
        {!manualDestination && destinationWalletType && (
          <BalanceHint chain={destinationChain} address={destinationAddress || undefined} />
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-white">Receive as</label>
        <Select value={receiveAs} onValueChange={setReceiveAs}>
          <SelectTrigger>
            <SelectValue placeholder="Select what to receive" />
          </SelectTrigger>
          <SelectContent>
            {receiveAsOptions.map((opt) => (
              <SelectItem key={opt.code} value={opt.code}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {receiveAs !== "USDC" && destinationChain === "stellar" && (
          <p className="text-xs text-white/50">
            {isQuoteLoading
              ? "Fetching estimate..."
              : payoutQuote
                ? `≈ ${payoutQuote.destinationAmount} ${receiveAs} (1 USDC ≈ ${payoutQuote.exchangeRate.toFixed(4)} ${receiveAs}) — you're guaranteed at least 95% of this if the rate moves before the bridge completes.`
                : "Enter an amount to see an estimate."}
          </p>
        )}
        {receiveAs !== "USDC" && destinationChain !== "stellar" && (
          <p className="text-xs text-white/50">
            No preview yet — once the bridge completes, you'll sign one more swap against a live rate to convert your USDC into {receiveAs}.
          </p>
        )}
      </div>

      <Button type="button" onClick={handleSubmit} isLoading={isBusy} className="w-full h-14 text-sm md:font-medium rounded-xl bg-secondary hover:bg-secondary/90 text-black">
        {isSigning ? "Waiting for signature..." : "Swap"}
      </Button>
      <p className="text-xs text-white/40 text-center">Bridging typically takes a few minutes to confirm.</p>
    </div>
  );
}

const MODE_HINT: Record<BridgeMode, string> = {
  receive: "Connect the wallet you want to receive into — we'll show its address as a QR code and copyable text to share with anyone paying you.",
  send: "Connect the wallet you're sending from and the destination wallet — we'll auto-fill both chains and addresses. Review, then send.",
  swap: "Bridge any registered stablecoin, on any chain, straight to any other registered stablecoin on any other chain — e.g. BRZ on Polygon → CNGN on Stellar, or USDT on Base → EURC on Ethereum.",
};

const MODE_LABEL: Record<BridgeMode, string> = {
  receive: "Receive",
  send: "Send",
  swap: "Bridge",
};

export function BridgePanel() {
  const [mode, setMode] = useState<BridgeMode>("send");

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-4 lg:p-6 space-y-4">
      <div className="flex gap-2 mb-2">
        {(["receive", "send", "swap"] as BridgeMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              mode === m ? "bg-secondary text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <p className="text-xs text-white/50">{MODE_HINT[mode]}</p>

      {mode === "receive" && <ReceiveTab />}
      {mode === "send" && <SendTab />}
      {mode === "swap" && <SwapTab />}
    </div>
  );
}
