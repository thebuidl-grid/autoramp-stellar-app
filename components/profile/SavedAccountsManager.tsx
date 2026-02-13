"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useSavedAccounts,
  useDeleteSavedAccount,
} from "@/lib/hooks/use-saved-accounts";
import { AddAccountDialog } from "./AddAccountDialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Building2 } from "lucide-react";

export function SavedAccountsManager() {
  const { toast } = useToast();
  const { data: accounts, isLoading } = useSavedAccounts();
  const deleteAccount = useDeleteSavedAccount();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handleDelete = (id: string, bankName: string) => {
    if (
      !confirm(`Are you sure you want to delete the account at ${bankName}?`)
    ) {
      return;
    }

    deleteAccount.mutate(id, {
      onSuccess: () => {
        toast({
          title: "Account deleted",
          description: "Saved account has been removed",
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Saved Bank Accounts</h2>
          <p className="text-zinc-400 text-sm">
            Manage your saved bank accounts for quick withdrawals
          </p>
        </div>
        <Button
          onClick={() => setIsAddDialogOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Account
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full bg-white/10" />
          ))}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="grid gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">
                      {account.bankName}
                    </h3>
                    {account.accountName && (
                      <p className="text-sm text-zinc-300 font-medium">
                        {account.accountName}
                      </p>
                    )}
                    <p className="text-sm text-zinc-400 font-mono mt-1">
                      {account.accountNumber}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Added {new Date(account.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(account.id, account.bankName)}
                  disabled={deleteAccount.isPending}
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
          <Building2 className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-white mb-1">
            No saved accounts
          </h3>
          <p className="text-zinc-400 text-sm mb-4">
            Add a bank account to save it for future transactions
          </p>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            variant="outline"
            className="border-zinc-700 text-white hover:bg-zinc-800"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Account
          </Button>
        </div>
      )}

      <AddAccountDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
      />
    </div>
  );
}
