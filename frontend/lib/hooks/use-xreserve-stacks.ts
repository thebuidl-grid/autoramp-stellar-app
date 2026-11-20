"use client";

import { useCallback, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { getPublicClient, waitForTransactionReceipt } from "@wagmi/core";
import { useConfig } from "wagmi";
import { ERC20_ABI } from "@/lib/constants/swap-constants";
import { IS_TESTNET } from "@/lib/constants/networks";
import {
  CIRCLE_XRESERVE_API_BASE,
  HIRO_API_BASE,
  STACKS_USDCX,
  STACKS_USDCX_API_BASE,
  XRESERVE_API_NETWORK,
  XRESERVE_DEFAULT_SOURCE_CHAIN_ID,
  XRESERVE_SOURCE_CHAIN_CONFIG,
  XRESERVE_SUPPORTED_SOURCE_CHAINS,
  XRESERVE_STACKS_DOMAIN,
  X_RESERVE_ABI,
} from "@/lib/constants/xreserve-constants";
import { encodeStacksDepositParams } from "@/lib/xreserve/stacks";
import { useToast } from "@/components/ui/toast";

export type XReserveStacksStatus =
  | "idle"
  | "switching"
  | "approving"
  | "depositing"
  | "confirming"
  | "minting"     // pending or attested — waiting on Circle
  | "mint-delayed"
  | "done";

/** Shape of one deposit entry returned by the USDCx API / Circle fallback. */
interface DepositEntry {
  ethTxid: string;
  status: "pending" | "attested" | "relayed" | string;
  stxRecipient?: string;
  amount?: string;
  amountFormatted?: string;
  /** Deposit message hash (keccak of the deposit payload) — Circle fallback only. */
  messageHash?: string;
}

const USDCX_FT_ID = `${STACKS_USDCX.tokenContract}::${STACKS_USDCX.tokenName}`;

/**
 * Read a Stacks address's USDCx balance via Hiro's CORS-enabled balances API.
 * Returns `null` on transport/API errors.
 */
async function fetchUsdcxBalance(principal: string): Promise<bigint | null> {
  try {
    const res = await fetch(
      `${HIRO_API_BASE}/extended/v1/address/${encodeURIComponent(
        principal,
      )}/balances`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      fungible_tokens?: Record<string, { balance?: string }>;
    };
    const raw = json?.fungible_tokens?.[USDCX_FT_ID]?.balance;
    return raw === undefined || raw === null ? 0n : BigInt(raw);
  } catch {
    return null;
  }
}

/**
 * Fallback status from Circle's xReserve attestation API (keyed by source
 * tx hash). Returns `pending` while Circle hasn't indexed the deposit yet
 * (empty/404), `attested` once a signed attestation exists, or null on
 * transport errors so the caller can keep retrying.
 */
async function fetchCircleDepositStatus(
  ethTxid: string,
): Promise<DepositEntry | null> {
  try {
    const res = await fetch(
      `${CIRCLE_XRESERVE_API_BASE}/v1/attestations?txHash=${ethTxid}`,
    );
    if (res.status === 404) return { ethTxid, status: "pending" };
    if (!res.ok) return null;
    const json = (await res.json()) as {
      attestations?: Array<{
        messageHash?: string;
        remoteDomain?: number;
      }>;
    };
    const attestations = json.attestations ?? [];
    if (attestations.length === 0) return { ethTxid, status: "pending" };
    // A tx can carry multiple attestations — prefer the Stacks one.
    const match =
      attestations.find((a) => a.remoteDomain === XRESERVE_STACKS_DOMAIN) ??
      attestations[0];
    if (!match?.messageHash) return { ethTxid, status: "pending" };
    return { ethTxid, status: "attested", messageHash: match.messageHash };
  } catch {
    return null;
  }
}

/**
 * Poll for this deposit's status and return the matching entry.
 *
 * 1. USDCx API `GET /<network>/deposits` (works on testnet; its `/mainnet/deposits`
 *    route currently 400s, returning null).
 * 2. Fallback: Circle xReserve attestation API by tx hash (works on mainnet).
 *
 * Returns null on network/API errors so the caller can keep retrying.
 */
async function fetchDepositStatus(
  ethTxid: string,
): Promise<DepositEntry | null> {
  try {
    const url = new URL(
      `${STACKS_USDCX_API_BASE}/${XRESERVE_API_NETWORK}/deposits`,
    );
    url.searchParams.set("ethTxid", ethTxid);
    const res = await fetch(url.toString());
    if (res.ok) {
      const json = (await res.json()) as { deposits?: DepositEntry[] };
      const match = json.deposits?.find(
        (d) => d.ethTxid?.toLowerCase() === ethTxid.toLowerCase(),
      );
      if (match) return match;
    }
  } catch {
    // fall through to the Circle API
  }
  return fetchCircleDepositStatus(ethTxid);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useXReserveStacks() {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();

  const [status, setStatus] = useState<XReserveStacksStatus>("idle");
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [depositHash, setDepositHash] = useState<`0x${string}` | undefined>();
  const [mintRecipient, setMintRecipient] = useState<string | null>(null);
  const [mintBaseline, setMintBaseline] = useState<bigint | null>(null);
  const [depositStatus, setDepositStatus] = useState<DepositEntry | null>(null);

  // Generation counter — incremented on reset/recheck so an in-flight loop
  // knows it has been superseded and should exit.
  const watchGenRef = useRef(0);

  const reset = useCallback(() => {
    watchGenRef.current += 1;
    setStatus("idle");
    setApproveHash(undefined);
    setDepositHash(undefined);
    setMintRecipient(null);
    setMintBaseline(null);
    setDepositStatus(null);
  }, []);

  /**
   * Poll the USDCx deposits API + Hiro balances until the deposit is verified
   * minted on Stacks.
   *
   * Verification uses two sources:
   *   - Hiro balance on the live USDCx contract (ground truth)
   *   - Deposit status API, falling back to Circle's attestation API when
   *     the USDCx deposits route is unavailable (mainnet currently 400s)
   *
   * Statuses from the API:
   *   pending  → ETH event seen, waiting for Circle attestation
   *   attested → Circle signed, waiting for the Stacks relay tx
   *   relayed  → mint confirmed on Stacks ✓
   *
   * Polls every 15s for up to ~15 min (60 attempts), then surfaces
   * `mint-delayed` so the user can manually recheck.
   */
  const watchDeposit = useCallback(
    async (ethTxid: string, recipient: string, baseline: bigint | null) => {
      const gen = ++watchGenRef.current;
      setMintRecipient(recipient);
      setMintBaseline(baseline);
      setStatus("minting");

      let base = baseline;
      for (let attempt = 0; attempt < 60; attempt++) {
        // First check after 5s (tx just confirmed), then every 15s
        await sleep(attempt === 0 ? 5_000 : 15_000);
        if (gen !== watchGenRef.current) return; // superseded by reset/recheck

        const [entry, balance] = await Promise.all([
          fetchDepositStatus(ethTxid),
          fetchUsdcxBalance(recipient),
        ]);

        if (entry) setDepositStatus(entry);

        // Ground truth: Hiro balance increased → mint has landed.
        if (balance !== null) {
          if (base === null) {
            base = balance;
            setMintBaseline(balance);
          } else if (balance > base) {
            setStatus("done");
            toast({
              title: "USDCx received",
              description: "Your deposit has minted into your Stacks wallet.",
              variant: "success",
            });
            return;
          }
        }

        // Informational API status.
        if (entry?.status === "relayed") {
          setStatus("done");
          toast({
            title: "USDCx relayed",
            description: "The deposit API reports USDCx minted on Stacks.",
            variant: "success",
          });
          return;
        }
      }

      if (gen !== watchGenRef.current) return;
      setStatus("mint-delayed");
    },
    [toast],
  );

  /** Re-run the deposit watch after a `mint-delayed` timeout. */
  const recheckMint = useCallback(async () => {
    if (!depositHash || !mintRecipient) return;
    await watchDeposit(depositHash, mintRecipient, mintBaseline);
  }, [depositHash, mintRecipient, mintBaseline, watchDeposit]);

  /**
   * Deposit USDC (active source chain) -> USDCx (Stacks).
   *
   * Flow:
   * 1. Validate amount + check USDC balance (no chain switch needed)
   * 2. Switch to the source chain only to sign: approve xReserve, then depositToRemote
   * 3. Switch back to original chain once the source chain confirms
   * 4. Poll Hiro balance + USDCx API until the mint is confirmed on Stacks
   *
   * Note: xReserve only accepts the configured source chains — Base is not
   * a supported source, so a chain switch is usually required.
   */
  const deposit = useCallback(
    async (params: {
      amount: string;
      stacksRecipient: string;
      sourceChainId?: number;
    }) => {
      if (!isConnected || !address) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your EVM wallet to continue",
          variant: "destructive",
        });
        return undefined;
      }

      const targetChainId =
        params.sourceChainId ??
        (chainId in XRESERVE_SOURCE_CHAIN_CONFIG
          ? chainId
          : XRESERVE_DEFAULT_SOURCE_CHAIN_ID);

      if (!(targetChainId in XRESERVE_SOURCE_CHAIN_CONFIG)) {
        toast({
          title: "Unsupported source chain",
          description: `Only ${XRESERVE_SUPPORTED_SOURCE_CHAINS.map((c) => c.label).join(
            " and ",
          )} are supported as xReserve sources.`,
          variant: "destructive",
        });
        return undefined;
      }
      const sourceConfig = XRESERVE_SOURCE_CHAIN_CONFIG[targetChainId];
      const sourceName =
        XRESERVE_SUPPORTED_SOURCE_CHAINS.find(
          (c) => c.chainId === targetChainId,
        )?.label ?? "source chain";

      const amountStr = params.amount.replace(/,/g, "").trim();
      const amountNum = Number(amountStr);
      if (!amountStr || !Number.isFinite(amountNum) || amountNum <= 0) {
        toast({
          title: "Invalid amount",
          description: "Please enter a valid USDC amount",
          variant: "destructive",
        });
        return undefined;
      }

      let encoded: { remoteRecipient: `0x${string}`; hookData: `0x${string}` };
      try {
        encoded = encodeStacksDepositParams(params.stacksRecipient);
      } catch (e: unknown) {
        toast({
          title: "Invalid Stacks address",
          description:
            e instanceof Error ? e.message : "Check the recipient ST... address",
          variant: "destructive",
        });
        return undefined;
      }

      let switchedToTargetChain = false;
      const restorePreviousChain = async () => {
        if (switchedToTargetChain && chainId !== targetChainId) {
          try {
            await switchChainAsync({ chainId });
          } catch {
            // user can switch manually
          }
        }
      };

      // Baseline USDCx balance before this deposit — the watcher needs this
      // to detect the minted amount landing in the recipient's wallet.
      const startBalance = await fetchUsdcxBalance(params.stacksRecipient);
      setMintBaseline(startBalance);
      setMintRecipient(params.stacksRecipient);

      try {
        const value = parseUnits(amountStr, sourceConfig.usdcDecimals);
        const maxFee = 0n;

        // 1. Balance check — read from the selected source chain so no wallet
        //    switch is needed just to read the balance. If the read fails
        //    (RPC not configured, etc.) we skip the pre-check and let the
        //    contract revert if the wallet truly has no USDC.
        const sourcePublicClient = getPublicClient(config, {
          chainId: targetChainId,
        });
        if (sourcePublicClient) {
          try {
            const balance = (await sourcePublicClient.readContract({
              address: sourceConfig.usdcAddress,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address as `0x${string}`],
            })) as bigint;

            if (balance < value) {
              toast({
                title: `Insufficient USDC on ${sourceName}`,
                description: `Connected wallet has ${formatUnits(
                  balance,
                  sourceConfig.usdcDecimals,
                )} USDC on ${sourceName}. You need ${amountStr}.`,
                variant: "destructive",
              });
              setStatus("idle");
              return undefined;
            }
          } catch (readErr) {
            console.warn(
              "xReserve: could not read USDC balance on source chain, skipping pre-check",
              readErr,
            );
          }
        }

        // 2. Switch to the source chain only now — right before signing
        if (chainId !== targetChainId) {
          setStatus("switching");
          await switchChainAsync({ chainId: targetChainId });
          switchedToTargetChain = true;
        }

        // 3. Approve xReserve to spend USDC
        setStatus("approving");
        let approveGas: bigint | undefined;
        try {
          approveGas = sourcePublicClient
            ? await sourcePublicClient.estimateContractGas({
                address: sourceConfig.usdcAddress,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [sourceConfig.xreserveAddress, value],
                account: address as `0x${string}`,
              })
            : undefined;
        } catch (gasErr) {
          console.warn("xReserve: failed to estimate approve gas", gasErr);
        }

        const approvalHash = await writeContractAsync({
          address: sourceConfig.usdcAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [sourceConfig.xreserveAddress, value],
          chainId: targetChainId,
          gas: approveGas ? (approveGas * 120n) / 100n : undefined,
        });
        setApproveHash(approvalHash);
        await waitForTransactionReceipt(config, {
          hash: approvalHash,
          chainId: targetChainId,
        });

        // 4. depositToRemote
        setStatus("depositing");
        let depositGas: bigint | undefined;
        try {
          depositGas = sourcePublicClient
            ? await sourcePublicClient.estimateContractGas({
                address: sourceConfig.xreserveAddress,
                abi: X_RESERVE_ABI,
                functionName: "depositToRemote",
                args: [
                  value,
                  XRESERVE_STACKS_DOMAIN,
                  encoded.remoteRecipient,
                  sourceConfig.usdcAddress,
                  maxFee,
                  encoded.hookData,
                ],
                account: address as `0x${string}`,
              })
            : undefined;
        } catch (gasErr) {
          console.warn("xReserve: failed to estimate deposit gas", gasErr);
        }

        const txHash = await writeContractAsync({
          address: sourceConfig.xreserveAddress,
          abi: X_RESERVE_ABI,
          functionName: "depositToRemote",
          args: [
            value,
            XRESERVE_STACKS_DOMAIN,
            encoded.remoteRecipient,
            sourceConfig.usdcAddress,
            maxFee,
            encoded.hookData,
          ],
          chainId: targetChainId,
          gas: depositGas ? (depositGas * 120n) / 100n : undefined,
        });
        setDepositHash(txHash);

        setStatus("confirming");
        await waitForTransactionReceipt(config, {
          hash: txHash,
          chainId: targetChainId,
        });

        // Source chain leg done — restore wallet chain, then poll for mint.
        await restorePreviousChain();
        toast({
          title: `Deposit confirmed on ${sourceName}`,
          description: IS_TESTNET
            ? "Waiting for Circle to attest and relay USDCx to your Stacks wallet (~15 min on testnet)."
            : "Waiting for Circle to attest and relay USDCx to your Stacks wallet.",
          variant: "success",
        });
        void watchDeposit(txHash, params.stacksRecipient, startBalance);
        return txHash;
      } catch (error: unknown) {
        console.error("xReserve Stacks deposit error:", error);
        setStatus("idle");
        await restorePreviousChain();
        const msg = error instanceof Error ? error.message.toLowerCase() : "";
        if (msg.includes("user rejected") || msg.includes("user denied")) {
          return undefined;
        }
        const description =
          error instanceof Error
            ? (error as Error & { shortMessage?: string }).shortMessage ||
              error.message
            : "Failed to deposit to xReserve";
        toast({
          title: "Deposit failed",
          description,
          variant: "destructive",
        });
        return undefined;
      }
    },
    [
      address,
      chainId,
      config,
      isConnected,
      switchChainAsync,
      toast,
      watchDeposit,
      writeContractAsync,
    ],
  );

  return {
    deposit,
    reset,
    recheckMint,
    status,
    approveHash,
    depositHash,
    mintRecipient,
    depositStatus,
    defaultSourceChainId: XRESERVE_DEFAULT_SOURCE_CHAIN_ID,
    stacksDomain: XRESERVE_STACKS_DOMAIN,
    isBusy:
      status !== "idle" && status !== "done" && status !== "mint-delayed",
  };
}
