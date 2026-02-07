"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface OfframpConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  amount: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isLoading?: boolean;
}

export function OfframpConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  amount,
  bankName,
  accountNumber,
  accountName,
  isLoading = false,
}: OfframpConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/30 backdrop-blur-xl rounded-xl border-white/10 text-white w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Confirm Transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-white/5 p-4 rounded-lg space-y-3 border border-white/10">
            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">Amount</span>
              <span className="text-white font-medium">{amount}</span>
            </div>

            <div className="h-[1px] bg-white/10 w-full" />

            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">Bank Name</span>
              <span className="text-white font-medium">{bankName}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">Account Number</span>
              <span className="text-white font-medium">{accountNumber}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">Account Name</span>
              <span className="text-white font-medium text-right max-w-[200px] truncate">
                {accountName}
              </span>
            </div>
          </div>

          <p className="text-xs text-white/50 text-center">
            Please verify the details above. Transactions are irreversible.
          </p>
        </div>

        <DialogFooter className="flex-col sm:justify-between gap-2 sm:gap-0">
          <div className="flex w-full gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 bg-transparent border-white/20 hover:bg-white/5 text-white"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              className="flex-1 bg-white text-black hover:bg-white/90"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing
                </>
              ) : (
                "Confirm Sell"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
