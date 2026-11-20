"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useUpdateSubAccount } from "@/lib/hooks/use-merchant-bank";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface SubAccountData {
  id: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  bankCode?: string;
  autoSweep?: boolean;
}

interface UpdateSubAccountFormProps {
  subAccount: SubAccountData;
  mode?: "merchant" | "admin";
  merchantId?: string;
  onSuccess?: () => void;
}

export function UpdateSubAccountForm({
  subAccount,
  mode = "merchant",
  merchantId,
  onSuccess,
}: UpdateSubAccountFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSubAccount = useUpdateSubAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [autoSweep, setAutoSweep] = useState(subAccount.autoSweep ?? false);
  const [autoSweepCallbackUrl, setAutoSweepCallbackUrl] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {};

    if (autoSweep !== (subAccount.autoSweep ?? false)) {
      payload.autoSweep = autoSweep;
    }
    if (autoSweep && autoSweepCallbackUrl) {
      payload.autoSweepDetails = { callbackUrl: autoSweepCallbackUrl };
    }
    if (callbackUrl) {
      payload.callbackUrl = callbackUrl;
    }

    if (Object.keys(payload).length === 0) {
      toast({
        title: "No changes",
        description: "Nothing to update.",
        variant: "default",
      });
      return;
    }

    try {
      await updateSubAccount.mutateAsync({ id: subAccount.id, data: payload, merchantId });
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-bank-account"] });
      toast({
        title: "Success",
        description: `Auto-sweep ${autoSweep ? "enabled" : "disabled"} successfully.`,
        variant: "success",
      });
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Failed to update sub-account.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setIsOpen(true)}
      >
        <Settings className="h-4 w-4" />
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Auto-Sweep Settings</DialogTitle>
          <DialogDescription>
            {subAccount.accountName} ({subAccount.accountNumber})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <input
              id="autoSweep"
              type="checkbox"
              checked={autoSweep}
              onChange={(e) => setAutoSweep(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <div className="flex-1">
              <Label htmlFor="autoSweep" className="text-sm font-medium cursor-pointer">
                {autoSweep ? "Auto-Sweep Enabled" : "Auto-Sweep Disabled"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {autoSweep
                  ? "Funds will be swept automatically to the main account."
                  : "Funds will remain in this sub-account."}
              </p>
            </div>
          </div>

          {autoSweep && (
            <div className="space-y-2">
              <Label htmlFor="autoSweepCallbackUrl">Sweep Callback URL</Label>
              <Input
                id="autoSweepCallbackUrl"
                value={autoSweepCallbackUrl}
                onChange={(e) => setAutoSweepCallbackUrl(e.target.value)}
                placeholder="https://webhook.example.com/sweep"
              />
              <p className="text-xs text-muted-foreground">
                Webhook URL to notify when a sweep occurs.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="callbackUrl">General Callback URL</Label>
            <Input
              id="callbackUrl"
              value={callbackUrl}
              onChange={(e) => setCallbackUrl(e.target.value)}
              placeholder="https://webhook.example.com/callback"
            />
            <p className="text-xs text-muted-foreground">
              General webhook URL for transaction events.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={updateSubAccount.isPending}>
              {updateSubAccount.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {autoSweep ? "Enable Auto-Sweep" : "Disable Auto-Sweep"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
