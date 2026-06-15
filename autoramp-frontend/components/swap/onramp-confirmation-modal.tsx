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
import { formatNumber } from "@/lib/utils";

interface OnrampConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  amount: string;
  walletAddress: string;
  network: string;
  isLoading?: boolean;
}

export function OnrampConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  amount,
  walletAddress,
  network,
  isLoading = false,
}: OnrampConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/30 backdrop-blur-xl rounded-xl border-white/10 text-white w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Confirm Purchase</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-white/5 p-4 rounded-lg space-y-3 border border-white/10">
            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">Amount to Pay</span>
              <span className="text-white font-medium">₦{amount}</span>
            </div>

            <div className="h-px bg-white/10 w-full" />

            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">Target Network</span>
              <span className="text-white font-medium">{network}</span>
            </div>

            <div className="flex justify-between items-start">
              <span className="text-white/50 text-sm mt-1">Wallet Address</span>
              <span className="text-white font-mono text-sm text-right break-all max-w-[200px]">
                {walletAddress}
              </span>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg">
            <p className="text-xs text-yellow-500 text-center">
              Please ensure the address above is on the{" "}
              <strong>{network}</strong> network. Sending funds to the wrong
              network may result in permanent loss.
            </p>
          </div>
        </div>

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
              "Confirm Buy"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
