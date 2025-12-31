"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TransactionDetailsDialog } from "./TransactionDetailsDialog";
import { Transaction } from "@/lib/api"; // Import the unified Transaction interface
import { useAdminSwapTransactions } from "@/lib/hooks/use-admin-swap-transactions"; // Import the new hook
import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton component

interface SwapTableProps {
  referenceSearchTerm: string;
}

export function SwapTable({
  referenceSearchTerm,
}: SwapTableProps) {
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const {
    data: swapTransactionsData,
    isLoading,
    isError,
  } = useAdminSwapTransactions(referenceSearchTerm);

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedTransaction(null);
  };

  const filteredTransactions = swapTransactionsData?.data?.transactions || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center text-red-500">
        Failed to load swap transactions.
      </div>
    );
  }

  return (
    <>
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                S/N
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                User ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reference
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                From
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Source Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Destination Address
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((txn, index) => (
                <tr
                  key={txn.id}
                  onClick={() => handleRowClick(txn)}
                  className="cursor-pointer hover:bg-muted-foreground/10"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {txn.userId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {txn.reference}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge
                      variant={
                        txn.status === "completed"
                          ? "default"
                          : txn.status === "pending"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {txn.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(txn.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{`${txn.fromAmount} ${txn.fromTokenType}`}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{`${txn.toAmount} ${txn.toTokenType}`}</td>
                  <td
                    className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground truncate"
                    style={{ maxWidth: "150px" }}
                  >
                    {txn.sourceAddress}
                  </td>
                  <td
                    className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground truncate"
                    style={{ maxWidth: "150px" }}
                  >
                    {txn.destinationAddress_swap}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground text-center">
                  No swap transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TransactionDetailsDialog
        transaction={selectedTransaction}
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
      />
    </>
  );
}
