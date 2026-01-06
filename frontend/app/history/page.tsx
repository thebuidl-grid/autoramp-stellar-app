"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { stablestackApi, Transaction, SwapTransaction } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
} from "lucide-react";

interface TransactionWithType extends Transaction {
  type?: "onramp" | "offramp";
}

interface SwapTransactionWithType extends SwapTransaction {
  type?: "swap";
}

type AllTransaction = TransactionWithType | SwapTransactionWithType;

function getStatusIcon(status: string) {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return <CheckCircle className="text-green-400" size={16} />;
    case "FAILED":
    case "REJECTED":
      return <XCircle className="text-red-400" size={16} />;
    default:
      return <Clock className="text-amber-400" size={16} />;
  }
}

function getStatusColor(status: string) {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "text-green-400";
    case "FAILED":
    case "REJECTED":
      return "text-red-400";
    default:
      return "text-amber-400";
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ITEMS_PER_PAGE = 10;

export default function HistoryPage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { _hasHydrated } = useAuthStore();
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, _hasHydrated, router]);

  const { data: transactionsData, isLoading, refetch } = useQuery({
    queryKey: ["transactions", page],
    queryFn: async () => {
      const response = await stablestackApi.getTransactions(
        undefined,
        undefined,
        page,
        ITEMS_PER_PAGE
      );
      return response.data;
    },
    enabled: isAuthenticated,
  });

  // Combine onramp, offramp, and swap transactions and add type
  const transactions: AllTransaction[] = [
    ...(transactionsData?.onramp?.map((tx) => ({ ...tx, type: "onramp" as const })) || []),
    ...(transactionsData?.offramp?.map((tx) => ({ ...tx, type: "offramp" as const })) || []),
    ...(transactionsData?.swap?.map((tx) => ({ ...tx, type: "swap" as const })) || []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPages = transactionsData?.totalPages || 1;
  const total = transactionsData?.total || 0;

  if (!_hasHydrated || !isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row gap-2 justify-between mb-4 md:mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Transaction History</h1>
              <p className="text-white/60">
                {total > 0 ? `${total} total transaction${total !== 1 ? "s" : ""}` : "View all your onramp and offramp transactions"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
              className="border-white/10 text-white hover:bg-white/10"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full bg-white/5" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-white/60 text-lg mb-4">No transactions found</p>
              <p className="text-white/40 text-sm">Your transaction history will appear here</p>
            </div>
          ) : (
            <>
              <Accordion type="single" collapsible className="w-full space-y-3 md:space-y-4">
                {transactions.map((tx) => {
                  const isOnramp = tx.type === "onramp";
                  const isSwap = tx.type === "swap";
                  const isOfframp = tx.type === "offramp";
                  
                  let displayAmount: string;
                  if (isSwap) {
                    const swapTx = tx as SwapTransactionWithType;
                    displayAmount = `${swapTx.fromAmount} ${swapTx.fromTokenType} → ${swapTx.toAmount} ${swapTx.toTokenType}`;
                  } else if (isOnramp) {
                    const onrampTx = tx as TransactionWithType;
                    displayAmount = `${onrampTx.tokenAmount || ""} ${onrampTx.tokenType || ""}`;
                  } else {
                    const offrampTx = tx as TransactionWithType;
                    displayAmount = `${offrampTx.amount || offrampTx.fiatAmount || ""} ${offrampTx.currency || "NGN"}`;
                  }

                  return (
                    <AccordionItem
                      key={tx.id}
                      value={tx.id}
                      className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 px-4 md:px-6"
                    >
                      {/* Basic Info - Always Visible */}
                      <AccordionTrigger className="hover:no-underline py-3 md:py-4">
                        <div className="flex items-start gap-3 md:gap-4 flex-1 text-left w-full">
                          <div className="mt-0.5 shrink-0">
                            {isOnramp ? (
                              <ArrowDownLeft className="text-green-400" size={20} />
                            ) : isSwap ? (
                              <ArrowLeftRight className="text-purple-400" size={20} />
                            ) : (
                              <ArrowUpRight className="text-blue-400" size={20} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                            <div className="min-w-0">
                              <div className="text-white font-semibold text-sm md:text-base">
                                {isOnramp ? "Onramp" : isSwap ? "Swap" : "Offramp"}
                              </div>
                              <div className="text-white/60 text-xs md:text-sm mt-0.5">
                                {formatDate(tx.createdAt)}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-white/60 text-xs md:text-sm">Amount</div>
                              <div className="text-white font-semibold text-sm md:text-base break-words">{displayAmount}</div>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(tx.status)}
                                <span className={`text-xs md:text-sm font-medium ${getStatusColor(tx.status)}`}>
                                  {tx.status}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 sm:col-span-2 md:col-span-1">
                              <div className="text-white/60 text-xs md:text-sm">Reference</div>
                              <div className="text-white font-mono text-xs truncate" title={tx.reference}>
                                {tx.reference}
                              </div>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>

                      {/* Detailed Info - Accordion Content */}
                      <AccordionContent>
                        <div className="pb-4 pt-2 space-y-4 border-t border-white/10 mt-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-white/60">Transaction ID:</span>
                              <div className="text-white font-mono text-xs mt-1 break-all">
                                {tx.id}
                              </div>
                            </div>
                            <div>
                              <span className="text-white/60">Reference:</span>
                              <div className="text-white font-mono text-xs mt-1 break-all">
                                {tx.reference}
                              </div>
                            </div>
                            {isSwap ? (
                              <>
                                <div>
                                  <span className="text-white/60">From:</span>
                                  <div className="text-white mt-1">
                                    {(tx as SwapTransactionWithType).fromAmount} {(tx as SwapTransactionWithType).fromTokenType}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-white/60">To:</span>
                                  <div className="text-white mt-1">
                                    {(tx as SwapTransactionWithType).toAmount} {(tx as SwapTransactionWithType).toTokenType}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-white/60">Exchange Rate:</span>
                                  <div className="text-white mt-1">
                                    1 {(tx as SwapTransactionWithType).fromTokenType} = {(tx as SwapTransactionWithType).exchangeRate} {(tx as SwapTransactionWithType).toTokenType}
                                  </div>
                                </div>
                                {(tx as SwapTransactionWithType).transactionHash && (
                                  <div className="md:col-span-2">
                                    <span className="text-white/60">Transaction Hash:</span>
                                    <div className="text-white font-mono text-xs mt-1 break-all">
                                      {(tx as SwapTransactionWithType).transactionHash}
                                    </div>
                                  </div>
                                )}
                                {(tx as SwapTransactionWithType).sourceAddress && (
                                  <div className="md:col-span-2">
                                    <span className="text-white/60">Source Address:</span>
                                    <div className="text-white font-mono text-xs mt-1 break-all">
                                      {(tx as SwapTransactionWithType).sourceAddress}
                                    </div>
                                  </div>
                                )}
                                {(tx as SwapTransactionWithType).destinationAddress && (
                                  <div className="md:col-span-2">
                                    <span className="text-white/60">Destination Address:</span>
                                    <div className="text-white font-mono text-xs mt-1 break-all">
                                      {(tx as SwapTransactionWithType).destinationAddress}
                                    </div>
                                  </div>
                                )}
                                {(tx as SwapTransactionWithType).fromNetwork && (
                                  <div>
                                    <span className="text-white/60">Network:</span>
                                    <div className="text-white mt-1">{(tx as SwapTransactionWithType).fromNetwork}</div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {(tx as TransactionWithType).destinationAddress && (
                                  <div className="md:col-span-2">
                                    <span className="text-white/60">
                                      {isOnramp ? "Destination Address:" : "Wallet Address:"}
                                    </span>
                                    <div className="text-white font-mono text-xs mt-1 break-all">
                                      {(tx as TransactionWithType).destinationAddress}
                                    </div>
                                  </div>
                                )}
                                {(tx as TransactionWithType).network && (
                                  <div>
                                    <span className="text-white/60">Network:</span>
                                    <div className="text-white mt-1">{(tx as TransactionWithType).network}</div>
                                  </div>
                                )}
                                {isOfframp && (tx as TransactionWithType).bankName && (
                                  <div>
                                    <span className="text-white/60">Bank Name:</span>
                                    <div className="text-white mt-1">{(tx as TransactionWithType).bankName}</div>
                                  </div>
                                )}
                                {isOfframp && (tx as TransactionWithType).accountNumber && (
                                  <div>
                                    <span className="text-white/60">Account Number:</span>
                                    <div className="text-white font-mono mt-1">{(tx as TransactionWithType).accountNumber}</div>
                                  </div>
                                )}
                                {isOfframp && (tx as TransactionWithType).accountName && (
                                  <div>
                                    <span className="text-white/60">Account Name:</span>
                                    <div className="text-white mt-1">{(tx as TransactionWithType).accountName}</div>
                                  </div>
                                )}
                              </>
                            )}
                            {tx.completedAt && (
                              <div>
                                <span className="text-white/60">Completed At:</span>
                                <div className="text-white mt-1">{formatDate(tx.completedAt)}</div>
                              </div>
                            )}
                            <div>
                              <span className="text-white/60">Created At:</span>
                              <div className="text-white mt-1">{formatDate(tx.createdAt)}</div>
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 md:mt-8 pt-4 md:pt-6 border-t border-white/10">
                  <div className="text-white/60 text-xs md:text-sm text-center sm:text-left">
                    Page {page} of {totalPages} ({total} total)
                  </div>
                  <div className="flex items-center gap-2 justify-center sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || isLoading}
                      className="border-white/10 text-white hover:bg-white/10 flex-1 sm:flex-initial"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || isLoading}
                      className="border-white/10 text-white hover:bg-white/10 flex-1 sm:flex-initial"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
