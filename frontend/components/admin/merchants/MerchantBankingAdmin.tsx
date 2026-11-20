"use client";

import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { merchantBankApi } from "@/lib/merchant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Landmark, AlertTriangle, CheckCircle, ChevronLeft, ArrowRight, ChevronDown } from "lucide-react";
import { UpdateSubAccountForm } from "@/components/merchant/bank/UpdateSubAccountForm";
import { useSubAccountBalances } from "@/lib/hooks/use-merchant-bank";

interface MerchantBankingAdminProps {
  merchantId: string;
}

export function MerchantBankingAdmin({ merchantId }: MerchantBankingAdminProps) {
  const queryClient = useQueryClient();
  const [justProvisioned, setJustProvisioned] = useState(false);
  const [accountType, setAccountType] = useState<"Savings" | "Current">("Savings");
  const [suffix, setSuffix] = useState("");
  const [provider, setProvider] = useState<"PULSE_MFB" | "SAFEHAVEN">("PULSE_MFB");
  const [selectedSubAccount, setSelectedSubAccount] = useState<{ id: string; accountName: string; accountNumber: string } | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [txStatusFilter, setTxStatusFilter] = useState<string>("");
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const txLimit = 20;

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ["merchantBankAccount", merchantId],
    queryFn: async () => {
      const res = await merchantBankApi.getAccount(merchantId);
      return res.data;
    },
  });

  const { data: subAccounts, isLoading: subsLoading, refetch: refetchSubs } = useQuery({
    queryKey: ["adminSubAccounts", merchantId],
    queryFn: async () => {
      const res = await adminApi.getAdminSubAccounts(merchantId);
      console.log("[MerchantBankingAdmin] getAdminSubAccounts response:", res.data);
      return res.data;
    },
  });

  const subAccountIds = subAccounts?.map((acc: any) => acc.id) || [];
  const { data: balances } = useSubAccountBalances(subAccountIds, merchantId);

  const { data: subAccountTxData, isLoading: txLoading } = useQuery({
    queryKey: ["adminSubAccountTransactions", merchantId, selectedSubAccount?.id, txPage, txStatusFilter],
    queryFn: async () => {
      if (!selectedSubAccount) return null;
      const res = await adminApi.getAdminSubAccountTransactions(merchantId, selectedSubAccount.id, {
        page: txPage,
        limit: txLimit,
        ...(txStatusFilter ? { status: txStatusFilter } : {}),
      });
      console.log("[MerchantBankingAdmin] sub-account transactions response:", res.data);
      return res.data;
    },
    enabled: !!selectedSubAccount,
  });

  const isLoading = accountLoading || subsLoading;

  const provisionMutation = useMutation({
    mutationFn: () =>
      adminApi.provisionMerchantBankAccount(merchantId, {
        accountType,
        suffix,
        provider,
      }),
    onSuccess: async () => {
      await refetchSubs();
      setJustProvisioned(true);
      setTimeout(() => setJustProvisioned(false), 5000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasAccount = !!account;

  const txTransactions = subAccountTxData?.data || [];
  const txPagination = subAccountTxData?.pagination;
  const txTotalPages = Number(txPagination?.totalPages) || 1;
  const txTotal = Number(txPagination?.total) || 0;

  function getStatusColor(status: string) {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-500 border border-green-500/20";
      case "Processing":
      case "Initiated":
      case "Created":
        return "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20";
      case "Failed":
      case "Canceled":
        return "bg-red-500/10 text-red-500 border border-red-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20";
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Bank Account Status
          </CardTitle>
          <CardDescription>
            MFB sub-account provisioning for this merchant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasAccount ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">MFB Account Active</span>
                <span className="text-xs text-muted-foreground">({account.provider})</span>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">Main Account</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Account Number</span>
                  <span className="font-medium">{account.accountNumber}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="font-medium">{account.accountName}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-medium">₦{(account.accountBalance || 0).toLocaleString()}</span>
                </div>
              </div>
              {subAccounts && subAccounts.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Sub-Accounts ({subAccounts.length})</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="p-3 text-left font-medium">Account Name</th>
                          <th className="p-3 text-left font-medium">Account Number</th>
                          <th className="p-3 text-left font-medium">Bank</th>
                          <th className="p-3 text-right font-medium">Balance</th>
                          <th className="p-3 text-center font-medium">Auto-Sweep</th>
                          <th className="p-3 text-center font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {subAccounts.map((acc: any) => {
                          const isSelected = selectedSubAccount?.id === acc.id;
                          return (
                            <tr
                              key={acc.id}
                              className={`hover:bg-muted/50 cursor-pointer transition-colors ${
                                isSelected ? "bg-muted/70" : ""
                              }`}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedSubAccount(null);
                                } else {
                                  setSelectedSubAccount({ id: acc.id, accountName: acc.accountName, accountNumber: acc.accountNumber });
                                  setTxPage(1);
                                }
                              }}
                            >
                              <td className="p-3 font-medium">
                                <div className="flex items-center gap-2">
                                  <ArrowRight className={`h-3 w-3 transition-transform ${isSelected ? "rotate-90" : ""}`} />
                                  {acc.accountName}
                                </div>
                              </td>
                              <td className="p-3">{acc.accountNumber}</td>
                              <td className="p-3 text-muted-foreground">{acc.bankName || "Safe Haven MFB"}</td>
                              <td className="p-3 text-right font-medium">
                                ₦{(balances?.[acc.id]?.accountBalance || 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  acc.autoSweep
                                    ? "bg-green-500/10 text-green-500 border border-green-500/20"
                                    : "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20"
                                }`}>
                                  {acc.autoSweep ? "ON" : "OFF"}
                                </span>
                              </td>
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <UpdateSubAccountForm
                                  subAccount={acc}
                                  mode="admin"
                                  merchantId={merchantId}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">No MFB Account</span>
              </div>
              <p className="text-sm text-muted-foreground">
                This merchant does not have an MFB sub-account. They will see
                errors when accessing the banking dashboard. Fill the details
                below to provision one.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={provider}
                    onValueChange={(v: "PULSE_MFB" | "SAFEHAVEN") => setProvider(v)}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PULSE_MFB">Pulse MFB</SelectItem>
                      <SelectItem value="SAFEHAVEN">SafeHaven</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountType">Account Type</Label>
                  <Select
                    value={accountType}
                    onValueChange={(v: "Savings" | "Current") => setAccountType(v)}
                  >
                    <SelectTrigger id="accountType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Savings">Savings</SelectItem>
                      <SelectItem value="Current">Current</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suffix">Suffix</Label>
                  <Input
                    id="suffix"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="ACME"
                  />
                </div>
              </div>
              <Button
                onClick={() => provisionMutation.mutate()}
                disabled={provisionMutation.isPending || !suffix}
              >
                {provisionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Landmark className="mr-2 h-4 w-4" />
                )}
                Provision MFB Account
              </Button>
              {justProvisioned && (
                <p className="text-sm text-green-500">
                  Account provisioned successfully!
                </p>
              )}
              {provisionMutation.isError && (
                <p className="text-sm text-destructive">
                  {(provisionMutation.error as any)?.response?.data?.message ||
                    "Failed to provision account."}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSubAccount && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  Transactions — {selectedSubAccount.accountName}
                </CardTitle>
                <CardDescription>
                  {selectedSubAccount.accountNumber} • Live transactions from SafeHaven
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSubAccount(null)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to list
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-3">
              <Select
                value={txStatusFilter || "all"}
                onValueChange={(v) => {
                  setTxStatusFilter(v === "all" ? "" : v);
                  setTxPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Processing">Processing</SelectItem>
                  <SelectItem value="Failed">Failed</SelectItem>
                  <SelectItem value="Canceled">Canceled</SelectItem>
                  <SelectItem value="Created">Created</SelectItem>
                  <SelectItem value="Initiated">Initiated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {txLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : txTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <p className="text-muted-foreground">No transactions found for this sub-account.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="p-3 text-left font-medium w-8"></th>
                        <th className="p-3 text-left font-medium">Date</th>
                        <th className="p-3 text-left font-medium">Type</th>
                        <th className="p-3 text-left font-medium">Reference</th>
                        <th className="p-3 text-left font-medium">Narration</th>
                        <th className="p-3 text-right font-medium">Amount</th>
                        <th className="p-3 text-center font-medium">Provider</th>
                        <th className="p-3 text-center font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {txTransactions.map((tx: any) => {
                        const isExpanded = expandedTxId === tx.id;
                        return (
                          <Fragment key={tx.id}>
                            <tr
                              className="hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                            >
                              <td className="p-3">
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </td>
                              <td className="p-3 text-muted-foreground whitespace-nowrap">
                                {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-NG", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }) : "—"}
                              </td>
                              <td className="p-3 whitespace-nowrap">{tx.type || "—"}</td>
                              <td className="p-3 font-mono text-xs">{tx.paymentReference || "—"}</td>
                              <td className="p-3 max-w-[200px] truncate">{tx.narration || "—"}</td>
                              <td className="p-3 text-right font-medium whitespace-nowrap">
                                ₦{tx.amount?.toLocaleString() || 0}
                              </td>
                              <td className="p-3 text-center text-muted-foreground">{tx.provider || "—"}</td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(tx.status)}`}>
                                  {tx.status}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="bg-muted/30 p-0">
                                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <p className="text-muted-foreground text-xs mb-1">Credit Account</p>
                                      <p className="font-medium font-mono">{tx.creditAccountNumber || "—"}</p>
                                      <p className="text-muted-foreground text-xs truncate">{tx.creditAccountName || ""}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs mb-1">Debit Account</p>
                                      <p className="font-medium font-mono">{tx.debitAccountNumber || "—"}</p>
                                      <p className="text-muted-foreground text-xs truncate">{tx.debitAccountName || ""}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs mb-1">Fees</p>
                                      <p className="font-medium">₦{(tx.fees || 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs mb-1">VAT</p>
                                      <p className="font-medium">₦{(tx.vat || 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs mb-1">Stamp Duty</p>
                                      <p className="font-medium">₦{(tx.stampDuty || 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs mb-1">Response Code</p>
                                      <p className="font-medium font-mono">{tx.responseCode || "—"}</p>
                                    </div>
                                    <div className="col-span-2">
                                      <p className="text-muted-foreground text-xs mb-1">Response Message</p>
                                      <p className="font-medium">{tx.responseMessage || "—"}</p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {txTotalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Page {txPage} of {txTotalPages} ({txTotal} total)
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={txPage <= 1}
                        onClick={() => setTxPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={txPage >= txTotalPages}
                        onClick={() => setTxPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
