"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, CheckCircle2, Clock, XCircle, ArrowRightLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";

export default function AdminOtcTransactionPage() {
    const params = useParams();
    const router = useRouter();
    const reference = params.reference as string;
    const { address, isConnected } = useAccount();

    const [isExecuting, setIsExecuting] = useState(false);
    const [swapError, setSwapError] = useState("");
    const [swapQuote, setSwapQuote] = useState<any>(null);

    const {
        data: txData,
        isLoading: isTxLoading,
        error: txError,
        refetch: refetchTx,
    } = useQuery({
        queryKey: ["admin-otc-transaction", reference],
        queryFn: async () => {
            const response = await adminApi.getOtcTransactions(1, 1, undefined, undefined, undefined, reference);
            if (response.data.transactions && response.data.transactions.length > 0) {
                return response.data.transactions[0];
            }
            throw new Error("Transaction not found");
        },
    });

    const { data: hash, sendTransaction, error: sendTxError } = useSendTransaction();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
    });

    useEffect(() => {
        if (isConfirmed) {
            setIsExecuting(false);
            refetchTx();
        }
    }, [isConfirmed, refetchTx]);

    useEffect(() => {
        if (sendTxError) {
            setIsExecuting(false);
            setSwapError(sendTxError.message);
        }
    }, [sendTxError]);

    const getStatusBadge = (status: string) => {
        switch (status?.toUpperCase()) {
            case "COMPLETED":
                return <Badge className="bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
            case "PENDING":
                return <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1 w-fit"><Clock className="h-3 w-3" /> Pending</Badge>;
            case "PROCESSING":
                return <Badge className="bg-blue-100 text-blue-700 flex items-center gap-1 w-fit"><Loader2 className="h-3 w-3 animate-spin" /> Processing</Badge>;
            case "FAILED":
                return <Badge className="bg-red-100 text-red-700 flex items-center gap-1 w-fit"><XCircle className="h-3 w-3" /> Failed</Badge>;
            default:
                return <Badge variant="outline">{status || "UNKNOWN"}</Badge>;
        }
    };

    const loadQuote = async () => {
        if (!txData || !isConnected || !address) {
            setSwapError("Please connect your wallet first");
            return;
        }

        try {
            setSwapError("");
            // The fromAmount is what the user sent and what we need to swap
            // We need to fetch the tokens (assuming they are in txData.meta or fixed for now)
            // For this example, let's assume we are selling USDC to buy CNGN 
            // Replace with actual logic based on your system
            const sellToken = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
            const buyToken = "0xc701eEBc6F72Dafb438253a6aCA3F5c1A1867cbb"; // CNGN on Base
            
            // Format sellAmount to base units (6 decimals for USDC)
            const sellAmount = parseUnits(txData.toAmount.toString(), 6).toString(); // Swap the 'toAmount' they are receiving

            const res = await adminApi.getOtcSwapQuote(sellToken, buyToken, sellAmount, address);
            setSwapQuote(res.data);
        } catch (err: any) {
            setSwapError(err.message || "Failed to load quote");
        }
    };

    const handleExecuteSwap = async () => {
        if (!swapQuote || !isConnected || !address) return;

        setIsExecuting(true);
        setSwapError("");

        try {
            sendTransaction({
                to: swapQuote.to,
                data: swapQuote.data as `0x${string}`,
                value: swapQuote.value ? BigInt(swapQuote.value) : undefined,
                gas: swapQuote.gas ? BigInt(swapQuote.gas) : undefined,
                gasPrice: swapQuote.gasPrice ? BigInt(swapQuote.gasPrice) : undefined,
            });
        } catch (err: any) {
            setIsExecuting(false);
            setSwapError(err.message || "Transaction failed to initiate");
        }
    };

    if (isTxLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (txError || !txData) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="pl-0 hover:bg-transparent">
                    <Link href="/admin/otc" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="w-4 h-4" /> Back to OTC
                    </Link>
                </Button>
                <Card className="border-destructive">
                    <CardContent className="pt-6 flex flex-col items-center text-center">
                        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                        <h2 className="text-xl font-semibold">Transaction Not Found</h2>
                        <p className="text-muted-foreground mt-2">The OTC transaction could not be loaded.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <Button variant="ghost" asChild className="pl-0 hover:bg-transparent">
                <Link href="/admin/otc" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4" /> Back to OTC
                </Link>
            </Button>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">OTC Transaction Details</h1>
                    <p className="text-muted-foreground text-sm font-mono mt-1">{txData.reference}</p>
                </div>
                {getStatusBadge(txData.status)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Details Column */}
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Transaction Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">User Email</p>
                                    <p className="font-medium">{txData.userEmail || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Exchange Rate</p>
                                    <p className="font-medium font-mono">{txData.exchangeRate || 0}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">From Amount</p>
                                    <p className="font-medium font-mono">{txData.fromAmount || 0} {txData.fromCurrency}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">To Amount</p>
                                    <p className="font-medium font-mono">{txData.toAmount || 0} {txData.toCurrency}</p>
                                </div>
                            </div>

                            {txData.meta?.safehavenData && (
                                <>
                                    <hr className="my-4 border-border" />
                                    <div>
                                        <p className="text-sm font-medium mb-2">SafeHaven Webhook Data</p>
                                        <div className="bg-muted rounded-md p-4 text-xs font-mono overflow-auto max-h-[200px]">
                                            <pre>{JSON.stringify(txData.meta.safehavenData, null, 2)}</pre>
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Execution Column */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="bg-muted/50 border-b">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <ArrowRightLeft className="w-5 h-5" /> Execute Swap
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            {txData.status !== "PROCESSING" ? (
                                <div className="text-center p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                        Swaps can only be executed when the transaction is in PROCESSING status.
                                    </p>
                                </div>
                            ) : !isConnected ? (
                                <div className="text-center p-4 bg-muted rounded-lg border border-dashed border-primary/50">
                                    <p className="text-sm font-medium text-foreground mb-2">Wallet Disconnected</p>
                                    <p className="text-xs text-muted-foreground">Connect your admin wallet to execute this swap.</p>
                                </div>
                            ) : (
                                <>
                                    {!swapQuote ? (
                                        <Button
                                            className="w-full"
                                            onClick={loadQuote}
                                        >
                                            Get Swap Quote
                                        </Button>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="bg-muted p-3 rounded-md text-sm">
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-muted-foreground">Estimated Gas:</span>
                                                    <span className="font-mono">{swapQuote.estimatedGas}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Buy Amount:</span>
                                                    <span className="font-mono truncate ml-2">{swapQuote.buyAmount} base units</span>
                                                </div>
                                            </div>

                                            <Button
                                                className="w-full"
                                                size="lg"
                                                onClick={handleExecuteSwap}
                                                disabled={isExecuting || isConfirming}
                                            >
                                                {isExecuting || isConfirming ? (
                                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Executing...</>
                                                ) : (
                                                    "Sign & Execute Trade"
                                                )}
                                            </Button>
                                        </div>
                                    )}

                                    {swapError && (
                                        <div className="p-3 bg-destructive/10 text-destructive rounded-md text-xs border border-destructive/20 break-words">
                                            {swapError}
                                        </div>
                                    )}

                                    {hash && (
                                        <div className="p-3 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 rounded-md text-xs mt-2 border border-blue-200 dark:border-blue-900 break-words">
                                            <p className="font-semibold mb-1">Transaction Initiated</p>
                                            <p className="font-mono">Hash: {hash}</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
