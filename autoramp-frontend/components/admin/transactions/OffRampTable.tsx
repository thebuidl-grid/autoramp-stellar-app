// "use client";

// import { useState } from "react";
// import { Badge } from "@/components/ui/badge";
// import { TransactionDetailsDialog } from "./TransactionDetailsDialog";
// import { Transaction } from "@/lib/api"; // Import the unified Transaction interface
// import { useAdminOffRampTransactions } from "@/lib/hooks/use-admin-offramp-transactions"; // Import the new hook
// import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton component

// interface OffRampTableProps {
//   referenceSearchTerm: string;
// }

// export function OffRampTable({ referenceSearchTerm }: OffRampTableProps) {
//   const [selectedTransaction, setSelectedTransaction] =
//     useState<Transaction | null>(null);
//   const [isDialogOpen, setIsDialogOpen] = useState(false);

//   const {
//     data: offRampTransactionsData,
//     isLoading,
//     isError,
//   } = useAdminOffRampTransactions(referenceSearchTerm);

//   const handleRowClick = (transaction: Transaction) => {
//     setSelectedTransaction(transaction);
//     setIsDialogOpen(true);
//   };

//   const handleDialogClose = () => {
//     setIsDialogOpen(false);
//     setSelectedTransaction(null);
//   };

//   const filteredTransactions =
//     offRampTransactionsData?.data?.transactions || [];

//   if (isLoading) {
//     return (
//       <div className="space-y-2">
//         <Skeleton className="h-10 w-full" />
//         <Skeleton className="h-10 w-full" />
//         <Skeleton className="h-10 w-full" />
//         <Skeleton className="h-10 w-full" />
//       </div>
//     );
//   }

//   if (isError) {
//     return (
//       <div className="text-center text-red-500">
//         Failed to load off-ramp transactions.
//       </div>
//     );
//   }

//   return (
//     <>
//       <div className="w-full overflow-x-auto">
//         <table className="min-w-full divide-y divide-border">
//           <thead className="bg-muted">
//             <tr>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 S/N
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 User ID
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Reference
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Status
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Date
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Token Amount
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Amount (NGN)
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Bank Code
//               </th>
//               <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Account No.
//               </th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-border">
//             {filteredTransactions.length > 0 ? (
//               filteredTransactions.map((txn: any, index: number) => (
//                 <tr
//                   key={txn.id}
//                   onClick={() => handleRowClick(txn)}
//                   className="cursor-pointer hover:bg-muted-foreground/10"
//                 >
//                   <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
//                     {index + 1}
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
//                     {txn.userId}
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
//                     {txn.reference}
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap">
//                     <Badge
//                       variant={
//                         txn.status === "completed"
//                           ? "default"
//                           : txn.status === "pending"
//                           ? "secondary"
//                           : "destructive"
//                       }
//                     >
//                       {txn.status}
//                     </Badge>
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
//                     {new Date(txn.createdAt).toLocaleDateString()}
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap text-sm">
//                     {txn.amount_offramp?.toLocaleString()}
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap text-sm">
//                     {txn.fiatAmount?.toLocaleString()}
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
//                     {txn.bankCode}
//                   </td>
//                   <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
//                     {txn.accountNumber}
//                   </td>
//                 </tr>
//               ))
//             ) : (
//               <tr>
//                 <td
//                   colSpan={9}
//                   className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground text-center"
//                 >
//                   No off-ramp transactions found.
//                 </td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//       </div>

//       <TransactionDetailsDialog
//         transaction={selectedTransaction}
//         isOpen={isDialogOpen}
//         onClose={handleDialogClose}
//       />
//     </>
//   );
// }
