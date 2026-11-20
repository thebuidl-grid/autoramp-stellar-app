"use client";

import { useCallback, useEffect, useState } from "react";
import { pad } from "viem";
import {
  STACKS_USDCX,
  STACKS_USDCX_API_BASE,
  XRESERVE_API_NETWORK,
} from "@/lib/constants/xreserve-constants";

export type BurnStatus =
  | "idle"
  | "awaiting-wallet"
  | "broadcasted"
  | "created"
  | "verified"
  | "confirmed"
  | "finalized"
  | "expired"
  | "failed";

export interface WithdrawalInfo {
  status: string;
  burnTxid: string;
  transactionHash?: string;
  attestation?: string;
  failureReason?: string;
}

/**
 * Burn USDCx on Stacks (usdcx-v1 `burn`) to redeem USDC on Ethereum.
 * The burn contract only supports native-domain 0 (Ethereum) — USDC lands
 * on the user's EVM address on the active network's Ethereum chain
 * (Sepolia on testnet, Ethereum on mainnet), then the app bridges
 * Ethereum->Base (existing BridgeKit flow) and optionally 0x-swaps
 * USDC->CNGN on Base.
 */
export function useStacksBurn() {
  const [status, setStatus] = useState<BurnStatus>("idle");
  const [burnTxid, setBurnTxid] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const burn = useCallback(
    async (params: {
      amount: string;
      evmRecipient: `0x${string}`;
      stacksSender: string;
    }) => {
      setError(undefined);
      const amountMicro = Math.round(Number(params.amount.replace(/,/g, "")) * 1e6);
      if (!Number.isFinite(amountMicro) || amountMicro <= 0) {
        setError("Enter a valid USDCx amount");
        return undefined;
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(params.evmRecipient)) {
        setError("Invalid EVM recipient address");
        return undefined;
      }

      try {
        setStatus("awaiting-wallet");
        const tx = await import("@stacks/transactions");
        const conn = await import("@stacks/connect");

        const padded = pad(params.evmRecipient, { size: 32 }).slice(2); // 64 hex chars
        const functionArgs = [
          tx.Cl.uint(amountMicro),
          tx.Cl.uint(0), // ETHEREUM_NATIVE_DOMAIN
          tx.Cl.bufferFromHex(padded),
        ];

        // Post-condition: sender sends exactly `amountMicro` of the USDCx FT
        const postCondition = tx.Pc.principal(params.stacksSender).willSendEq(
          BigInt(amountMicro),
        ).ft(STACKS_USDCX.tokenContract, STACKS_USDCX.tokenName);

        const txId: string = await new Promise((resolve, reject) => {
          conn.openContractCall({
            contractAddress: STACKS_USDCX.address,
            contractName: STACKS_USDCX.contractName,
            functionName: "burn",
            functionArgs,
            network: STACKS_USDCX.network,
            postConditions: [postCondition],
            postConditionMode: tx.PostConditionMode.Deny,
            onFinish: (data: { txId: string }) => resolve(data.txId),
            onCancel: () => reject(new Error("Stacks wallet popup closed")),
          } as Parameters<typeof conn.openContractCall>[0]);
        });

        const normalized = txId.startsWith("0x") ? txId : `0x${txId}`;
        setBurnTxid(normalized);
        setStatus("broadcasted");
        return normalized;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Stacks burn failed";
        if (/closed|cancel|denied|rejected/i.test(msg)) {
          setStatus("idle");
          return undefined;
        }
        setError(msg);
        setStatus("failed");
        return undefined;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setBurnTxid(undefined);
    setError(undefined);
  }, []);

  return { burn, reset, status, setStatus, burnTxid, error };
}

/** Poll the Stacks USDCx API for withdrawal status after a burn. */
export function useStacksWithdrawalStatus(
  burnTxid?: string,
  eventIndex = 0,
  enabled = true,
) {
  const [info, setInfo] = useState<WithdrawalInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!burnTxid || !enabled) return;
    let cancelled = false;
    setIsLoading(true);

    const fetchOnce = async () => {
      try {
        const res = await fetch(
          `${STACKS_USDCX_API_BASE}/${XRESERVE_API_NETWORK}/withdrawals/${burnTxid}/${eventIndex}`,
        );
        if (!res.ok) return; // burn not indexed yet
        const json = await res.json();
        if (!cancelled) {
          setInfo({
            status: json?.circleResponse?.status ?? json?.status ?? "created",
            burnTxid,
            transactionHash: json?.circleResponse?.transactionHash,
            attestation: json?.circleResponse?.attestation,
            failureReason: json?.circleResponse?.failureReason,
          });
        }
      } catch {
        // ignore transient errors; keep polling
      }
    };

    fetchOnce();
    const terminal = ["finalized", "expired", "failed"];
    const id = setInterval(() => {
      if (terminal.includes(info?.status ?? "")) {
        clearInterval(id);
        return;
      }
      fetchOnce();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burnTxid, eventIndex, enabled]);

  useEffect(() => {
    if (info) setIsLoading(false);
  }, [info]);

  return { info, isLoading };
}
