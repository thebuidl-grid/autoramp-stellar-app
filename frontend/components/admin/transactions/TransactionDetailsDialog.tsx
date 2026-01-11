"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SwapTransaction, Transaction } from "@/lib/api";
import { format } from "date-fns";

interface TransactionDetailsDialogProps {
  transaction: unknown;
  isOpen: boolean;
  onClose: () => void;
}

export function TransactionDetailsDialog({
  transaction,
  isOpen,
  onClose,
}: TransactionDetailsDialogProps) {
  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>
            Detailed information about transaction ID:{" "}
            {(transaction as Transaction).id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">ID:</p>
            <p className="col-span-2 text-sm text-muted-foreground break-all">
              {(transaction as Transaction).id}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">User ID:</p>
            <p className="col-span-2 text-sm text-muted-foreground break-all">
              {(transaction as Transaction).userId}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Reference:</p>
            <p className="col-span-2 text-sm text-muted-foreground break-all">
              {(transaction as Transaction).reference}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Type:</p>
            <p className="col-span-2 text-sm text-muted-foreground capitalize">
              {(transaction as Transaction).transactionType}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Status:</p>
            <p className="col-span-2 text-sm text-muted-foreground capitalize">
              {(transaction as Transaction).status}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Created At:</p>
            <p className="col-span-2 text-sm text-muted-foreground">
              {format(
                new Date((transaction as Transaction).createdAt),
                "PPP p"
              )}
            </p>
          </div>
          {(transaction as Transaction).completedAt && (
            <div className="grid grid-cols-3 items-center gap-4">
              <p className="text-sm font-medium">Completed At:</p>
              <p className="col-span-2 text-sm text-muted-foreground">
                {format(
                  new Date((transaction as Transaction).completedAt || ""),
                  "PPP p"
                )}
              </p>
            </div>
          )}

          {/* On-Ramp Specific */}
          {(transaction as Transaction).transactionType === "onramp" && (
            <>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Amount (NGN):</p>
                <p className="col-span-2 text-sm text-muted-foreground">
                  {(transaction as Transaction).amount?.toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Token Amount (cNGN):</p>
                <p className="col-span-2 text-sm text-muted-foreground">
                  {(transaction as Transaction).tokenAmount?.toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Destination Address:</p>
                <p className="col-span-2 text-sm text-muted-foreground break-all">
                  {(transaction as Transaction).destinationAddress}
                </p>
              </div>
            </>
          )}

          {/* Off-Ramp Specific */}
          {(transaction as Transaction).transactionType === "offramp" && (
            <>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Amount (Token):</p>
                <p className="col-span-2 text-sm text-muted-foreground">
                  {(
                    transaction as Transaction
                  ).amount_offramp?.toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Fiat Amount (NGN):</p>
                <p className="col-span-2 text-sm text-muted-foreground">
                  {(transaction as Transaction).fiatAmount?.toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Bank Code:</p>
                <p className="col-span-2 text-sm text-muted-foreground">
                  {(transaction as Transaction).bankCode}
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Account Number:</p>
                <p className="col-span-2 text-sm text-muted-foreground">
                  {(transaction as Transaction).accountNumber}
                </p>
              </div>
            </>
          )}

          {/* Swap Specific */}
          {(transaction as Transaction).transactionType === "swap" && (
            <>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">From:</p>
                <p className="col-span-2 text-sm text-muted-foreground">{`${
                  (transaction as SwapTransaction).fromAmount
                } ${(transaction as SwapTransaction).fromTokenType}`}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">To:</p>
                <p className="col-span-2 text-sm text-muted-foreground">{`${
                  (transaction as SwapTransaction).toAmount
                } ${(transaction as SwapTransaction).toTokenType}`}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Exchange Rate:</p>
                <p className="col-span-2 text-sm text-muted-foreground">
                  {(
                    transaction as SwapTransaction
                  ).exchangeRate?.toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Source Address:</p>
                <p className="col-span-2 text-sm text-muted-foreground break-all">
                  {(transaction as SwapTransaction).sourceAddress}
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Destination Address:</p>
                <p className="col-span-2 text-sm text-muted-foreground break-all">
                  {(transaction as SwapTransaction).destinationAddress}
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
