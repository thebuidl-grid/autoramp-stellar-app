"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AuthFlow } from "./auth-flow";

interface EmailOtpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (token: string) => void;
}

export function EmailOtpModal({
  open,
  onOpenChange,
  onSuccess,
}: EmailOtpModalProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSuccess = (token: string) => {
    onSuccess(token);
    onOpenChange(false);
  };

  return (
    <div className="mx-2">
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-black/30 backdrop-blur-xl rounded-xl border-white/10 text-white w-[calc(100%-2rem)] max-w-md data-[state=open]:animate-modal-open data-[state=closed]:animate-modal-close">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">
              Sign in to continue
            </DialogTitle>
          </DialogHeader>
          <AuthFlow onSuccess={handleSuccess} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
