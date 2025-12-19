"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, truncateAddress, copyToClipboard } from "@/lib/utils";
import { Transaction } from "@/lib/api";
import { Copy, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

interface TransactionDetailsDialogProps {
  transaction: Transaction & { type?: "onramp" | "offramp" };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailsDialog({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailsDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, label: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
        variant: "success",
      });
    }
  };

  const isOnramp = transaction.type === "onramp" || transaction.destinationAddress;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Transaction Details
            <StatusBadge status={transaction.status} />
          </DialogTitle>
          <DialogDescription>
            Complete information about this transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Transaction ID</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm">{transaction.id}</p>
                <button
                  onClick={() => handleCopy(transaction.id, "Transaction ID")}
                  className="p-1 hover:bg-muted rounded"
                >
                  {copied === transaction.id ? (
                    <CheckCircle size={14} className="text-success" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Reference</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm">{transaction.reference}</p>
                <button
                  onClick={() => handleCopy(transaction.reference, "Reference")}
                  className="p-1 hover:bg-muted rounded"
                >
                  {copied === transaction.reference ? (
                    <CheckCircle size={14} className="text-success" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
            {transaction.flintTransactionId && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Flint Transaction ID</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm">{transaction.flintTransactionId}</p>
                  <button
                    onClick={() => handleCopy(transaction.flintTransactionId!, "Flint Transaction ID")}
                    className="p-1 hover:bg-muted rounded"
                  >
                    {copied === transaction.flintTransactionId ? (
                      <CheckCircle size={14} className="text-success" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <StatusBadge status={transaction.status} />
            </div>
          </div>

          {/* Amounts */}
          <div className="border-t border-border pt-4">
            <h3 className="font-semibold mb-3">Amounts</h3>
            <div className="grid grid-cols-2 gap-4">
              {isOnramp ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Fiat Amount</p>
                    <p className="font-bold">{formatCurrency(transaction.amount, transaction.currency || "NGN")}</p>
                  </div>
                  {transaction.tokenAmount && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Token Amount</p>
                      <p className="font-bold">{transaction.tokenAmount} {transaction.tokenType || "CNGN"}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Crypto Amount</p>
                    <p className="font-bold">{transaction.amount} {transaction.tokenType || "CNGN"}</p>
                  </div>
                  {transaction.fiatAmount && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Fiat Amount</p>
                      <p className="font-bold">{formatCurrency(transaction.fiatAmount, transaction.currency || "NGN")}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Network & Addresses */}
          <div className="border-t border-border pt-4">
            <h3 className="font-semibold mb-3">Network & Addresses</h3>
            <div className="space-y-3">
              {transaction.network && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Network</p>
                  <p className="font-medium capitalize">{transaction.network}</p>
                </div>
              )}
              {isOnramp && transaction.destinationAddress && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Destination Address</p>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                    <code className="font-mono text-sm flex-1 break-all">
                      {transaction.destinationAddress}
                    </code>
                    <button
                      onClick={() => handleCopy(transaction.destinationAddress!, "Destination Address")}
                      className="p-1 hover:bg-background rounded shrink-0"
                    >
                      {copied === transaction.destinationAddress ? (
                        <CheckCircle size={16} className="text-success" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>
              )}
              {!isOnramp && transaction.accountNumber && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Bank Account</p>
                  <div className="space-y-2">
                    {transaction.bankName && (
                      <p className="font-medium">{transaction.bankName}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <p className="font-mono">{transaction.accountNumber}</p>
                      {transaction.accountName && (
                        <span className="text-sm text-muted-foreground">- {transaction.accountName}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="border-t border-border pt-4">
            <h3 className="font-semibold mb-3">Timestamps</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Created</p>
                <p className="text-sm">{formatDate(transaction.createdAt)}</p>
              </div>
              {transaction.completedAt && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Completed</p>
                  <p className="text-sm">{formatDate(transaction.completedAt)}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-1">Last Updated</p>
                <p className="text-sm">{formatDate(transaction.updatedAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

