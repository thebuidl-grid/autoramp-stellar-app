"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useSavedWallets,
  useDeleteWallet,
} from "@/lib/hooks/use-saved-wallets";
import { AddWalletDialog } from "./AddWalletDialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Wallet } from "lucide-react";

export function SavedWalletsManager() {
  const { toast } = useToast();
  const { data: wallets, isLoading } = useSavedWallets();
  const deleteWallet = useDeleteWallet();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handleDelete = (id: string, address: string) => {
    if (
      !confirm(
        `Are you sure you want to delete wallet ${address.slice(0, 6)}...${address.slice(-4)}?`,
      )
    ) {
      return;
    }

    deleteWallet.mutate(id, {
      onSuccess: () => {
        toast({
          title: "Wallet deleted",
          description: "Saved wallet has been removed",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      },
    });
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Saved Wallets</h2>
          <p className="text-zinc-400 text-sm">
            Manage your saved wallet addresses for quick deposits
          </p>
        </div>
        <Button
          onClick={() => setIsAddDialogOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Wallet
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full bg-white/10" />
          ))}
        </div>
      ) : wallets && wallets.length > 0 ? (
        <div className="grid gap-4">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">
                      {wallet.name || "Wallet"}
                    </h3>
                    <p className="text-sm text-zinc-400 font-mono mt-1">
                      {formatAddress(wallet.address)}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-zinc-500 capitalize">
                        {wallet.network}
                      </span>
                      <span className="text-xs text-zinc-600">•</span>
                      <span className="text-xs text-zinc-500">
                        Added {new Date(wallet.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(wallet.id, wallet.address)}
                  disabled={deleteWallet.isPending}
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800 rounded-lg">
          <Wallet className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-white mb-1">
            No saved wallets
          </h3>
          <p className="text-zinc-400 text-sm mb-4">
            Add a wallet address to save it for future transactions
          </p>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            variant="outline"
            className="border-zinc-700 text-white hover:bg-zinc-800"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Wallet
          </Button>
        </div>
      )}

      <AddWalletDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
      />
    </div>
  );
}
