"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Transaction } from "@/lib/api";
import { format } from "date-fns";

interface TransactionDetailsDialogProps {
  transaction: Transaction | null;
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
            Detailed information about transaction ID: {transaction.id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">ID:</p>
            <p className="col-span-2 text-sm text-muted-foreground break-all">{transaction.id}</p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">User ID:</p>
            <p className="col-span-2 text-sm text-muted-foreground break-all">{transaction.userId}</p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Reference:</p>
            <p className="col-span-2 text-sm text-muted-foreground break-all">{transaction.reference}</p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Type:</p>
            <p className="col-span-2 text-sm text-muted-foreground capitalize">{transaction.transactionType}</p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Status:</p>
            <p className="col-span-2 text-sm text-muted-foreground capitalize">{transaction.status}</p>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <p className="text-sm font-medium">Created At:</p>
            <p className="col-span-2 text-sm text-muted-foreground">
              {format(new Date(transaction.createdAt), "PPP p")}
            </p>
          </div>
          {transaction.completedAt && (
            <div className="grid grid-cols-3 items-center gap-4">
              <p className="text-sm font-medium">Completed At:</p>
              <p className="col-span-2 text-sm text-muted-foreground">
                {format(new Date(transaction.completedAt), "PPP p")}
              </p>
            </div>
          )}

          {/* On-Ramp Specific */}
          {transaction.transactionType === "onramp" && (
            <>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Amount (NGN):</p>
                <p className="col-span-2 text-sm text-muted-foreground">{transaction.amount?.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Token Amount (cNGN):</p>
                <p className="col-span-2 text-sm text-muted-foreground">{transaction.tokenAmount?.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Destination Address:</p>
                <p className="col-span-2 text-sm text-muted-foreground break-all">{transaction.destinationAddress}</p>
              </div>
            </>
          )}

          {/* Off-Ramp Specific */}
          {transaction.transactionType === "offramp" && (
            <>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Amount (Token):</p>
                <p className="col-span-2 text-sm text-muted-foreground">{transaction.amount_offramp?.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Fiat Amount (NGN):</p>
                <p className="col-span-2 text-sm text-muted-foreground">{transaction.fiatAmount?.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Bank Code:</p>
                <p className="col-span-2 text-sm text-muted-foreground">{transaction.bankCode}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Account Number:</p>
                <p className="col-span-2 text-sm text-muted-foreground">{transaction.accountNumber}</p>
              </div>
            </>
          )}

          {/* Swap Specific */}
          {transaction.transactionType === "swap" && (
            <>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">From:</p>
                <p className="col-span-2 text-sm text-muted-foreground">{`${transaction.fromAmount} ${transaction.fromTokenType}`}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">To:</p>
                <p className="col-span-2 text-sm text-muted-foreground">{`${transaction.toAmount} ${transaction.toTokenType}`}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Exchange Rate:</p>
                <p className="col-span-2 text-sm text-muted-foreground">{transaction.exchangeRate?.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Source Address:</p>
                <p className="col-span-2 text-sm text-muted-foreground break-all">{transaction.sourceAddress}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <p className="text-sm font-medium">Destination Address:</p>
                <p className="col-span-2 text-sm text-muted-foreground break-all">{transaction.destinationAddress_swap}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}