"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  useMerchantBankAccount,
  useMerchantBankStats,
  useMerchantSubAccounts,
  useMerchantTransfers,
  useCreateSubAccount,
  useTransfer,
  useCreateVirtualAccount,
  useInitiateVerification,
  useValidateVerification,
} from "@/lib/hooks/use-merchant-bank";
import { useResolveAccount } from "@/lib/hooks/use-transactions";
import { BankAnalyticsChart } from "@/components/merchant/bank/BankAnalyticsChart";
import {
  Loader2,
  Landmark,
  Wallet,
  ArrowRightLeft,
  UserPlus,
  ShieldCheck,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { useBanks } from "@/lib/hooks";

import { WithdrawModal } from "@/components/merchant/bank/WithdrawModal";

export default function MerchantBankPage() {
  const { data: account, isLoading: accountLoading, error: accountError } = useMerchantBankAccount();
  const provider = account?.provider || "SafeHaven";
  const isSafeHaven = provider === "SafeHaven";
  const { data: subAccounts = [] } = useMerchantSubAccounts();
  const { data: banks = [] } = useBanks();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const noAccountError =
    (accountError as any)?.response?.data?.message || "";
  const hasNoAccount =
    noAccountError.toLowerCase().includes("no mfb sub-account") ||
    noAccountError.toLowerCase().includes("please contact support");

  if (accountLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasNoAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold">Banking Access Not Available</h2>
          <p className="text-muted-foreground">
            Your merchant account does not have an MFB sub-account provisioned
            yet. Please contact the administrator to set up banking access for
            your account.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm">
          <Landmark className="h-4 w-4" />
          Provider: {provider}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Merchant Banking</h1>
          <p className="text-muted-foreground">
            Manage your merchant bank account, sub-accounts, transfers, and more.
          </p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium">
            <Landmark className="h-3 w-3" />
            Provider: {provider}
          </div>
        </div>
        <Button
          onClick={() => setWithdrawOpen(true)}
          className="bg-primary text-black hover:bg-primary/90 shrink-0 self-start"
          disabled={subAccounts.length === 0}
        >
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Withdraw
        </Button>
      </div>

      <WithdrawModal
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        subAccounts={subAccounts}
        banks={banks}
      />

      <AccountOverview />

      <BankAnalyticsChart />

      <Tabs defaultValue="sub-accounts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:w-auto">
          <TabsTrigger value="sub-accounts">Sub-Accounts</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          {isSafeHaven && (
            <TabsTrigger value="virtual-accounts">Virtual Accounts</TabsTrigger>
          )}
          {isSafeHaven && (
            <TabsTrigger value="identity">Identity</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sub-accounts">
          <SubAccountsTab />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab />
        </TabsContent>
        {isSafeHaven && (
          <TabsContent value="virtual-accounts">
            <VirtualAccountsTab />
          </TabsContent>
        )}
        {isSafeHaven && (
          <TabsContent value="identity">
            <IdentityTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ============== Account Overview ==============

function AccountOverview() {
  const { data: account, isLoading } = useMerchantBankAccount();
  const { data: stats, isLoading: statsLoading } = useMerchantBankStats();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Account Balance</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-2xl font-bold">
              ₦{(account?.accountBalance || 0).toLocaleString()}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {account?.accountNumber || "---"} | {account?.accountName || "---"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Book Balance</CardTitle>
          <Landmark className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-2xl font-bold">
              ₦{(account?.bookBalance || 0).toLocaleString()}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Ledger balance</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Transfers</CardTitle>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-2xl font-bold">{stats?.transferCount || 0}</div>
          )}
          <p className="text-xs text-muted-foreground">Last 30 days</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Money Moved</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-2xl font-bold">
              ₦{(stats?.totalMoneyMoved || 0).toLocaleString()}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Last 30 days</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== Sub-Accounts Tab ==============

function SubAccountsTab() {
  const { data: subAccounts, isLoading } = useMerchantSubAccounts();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Sub-Accounts</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              Create Sub-Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <CreateSubAccountForm onSuccess={() => setIsCreateDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !subAccounts || subAccounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <UserPlus className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No sub-accounts yet.</p>
            <p className="text-sm text-muted-foreground">
              Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted text-sm font-medium text-muted-foreground">
            <div className="col-span-3">Account Name</div>
            <div className="col-span-2">Account Number</div>
            <div className="col-span-2">Bank</div>
            <div className="col-span-2 text-center">Auto-Sweep</div>
            <div className="col-span-3 text-right">Created</div>
          </div>
          <div className="divide-y">
            {subAccounts.map((sub) => (
              <Link
                key={sub.id}
                href={`/merchant/dashboard/bank/sub-accounts/${sub.id}`}
                className="grid grid-cols-12 gap-4 px-4 py-3 text-sm items-center hover:bg-muted/50 transition-colors"
              >
                <div className="col-span-3 font-medium">{sub.accountName}</div>
                <div className="col-span-2">{sub.accountNumber}</div>
                <div className="col-span-2 text-muted-foreground">{sub.bankName}</div>
                <div className="col-span-2 text-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    sub.autoSweep
                      ? "bg-green-500/10 text-green-500 border border-green-500/20"
                      : "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20"
                  }`}>
                    {sub.autoSweep ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="col-span-3 text-right text-muted-foreground">
                  {sub.createdAt
                    ? format(new Date(sub.createdAt), "MMM d, yyyy")
                    : "N/A"}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateSubAccountForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const createSubAccount = useCreateSubAccount();
  const { data: account } = useMerchantBankAccount();
  const isSafeHaven = account?.provider === "SafeHaven";
  const [form, setForm] = useState({
    phoneNumber: "",
    emailAddress: "",
    externalReference: "",
    identityType: "BVN" as "BVN" | "NIN" | "vNIN" | "BVNUSSD" | "CAC" | "CREDITCHECK",
    identityNumber: "",
    otp: "",
    callbackUrl: "",
    autoSweep: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      phoneNumber: form.phoneNumber,
      emailAddress: form.emailAddress,
      externalReference: form.externalReference,
    };
    if (isSafeHaven) {
      if (form.identityType) payload.identityType = form.identityType;
      if (form.identityNumber) payload.identityNumber = form.identityNumber;
      if (form.callbackUrl) payload.callbackUrl = form.callbackUrl;
      if (form.autoSweep) payload.autoSweep = form.autoSweep;
      if (form.identityType === "BVNUSSD" && form.otp) payload.otp = form.otp;
    }
    try {
      await createSubAccount.mutateAsync(payload);
      toast({
        title: "Success",
        description: "Sub-account created successfully.",
        variant: "success",
      });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Failed to create sub-account.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Sub-Account</DialogTitle>
        <DialogDescription>
          Create a new sub-account under your merchant account.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label htmlFor="phoneNumber">Phone Number</Label>
          <Input
            id="phoneNumber"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="08012345678"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailAddress">Email</Label>
          <Input
            id="emailAddress"
            type="email"
            value={form.emailAddress}
            onChange={(e) => setForm({ ...form, emailAddress: e.target.value })}
            placeholder="user@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="externalReference">External Reference</Label>
          <Input
            id="externalReference"
            value={form.externalReference}
            onChange={(e) =>
              setForm({ ...form, externalReference: e.target.value })
            }
            placeholder="ref-123456"
            required
          />
        </div>
        {isSafeHaven && (
          <>
            <div className="space-y-2">
              <Label htmlFor="identityType">Identity Type</Label>
              <Select
                value={form.identityType}
                onValueChange={(v: any) =>
                  setForm({ ...form, identityType: v, otp: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BVN">BVN</SelectItem>
                  <SelectItem value="NIN">NIN</SelectItem>
                  <SelectItem value="vNIN">vNIN</SelectItem>
                  <SelectItem value="BVNUSSD">BVNUSSD</SelectItem>
                  <SelectItem value="CAC">CAC</SelectItem>
                  <SelectItem value="CREDITCHECK">CREDITCHECK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="identityNumber">Identity Number</Label>
              <Input
                id="identityNumber"
                value={form.identityNumber}
                onChange={(e) =>
                  setForm({ ...form, identityNumber: e.target.value })
                }
                placeholder="22222222222"
              />
            </div>
            {form.identityType === "BVNUSSD" && (
              <div className="space-y-2">
                <Label htmlFor="subAccountOtp">OTP</Label>
                <Input
                  id="subAccountOtp"
                  value={form.otp}
                  onChange={(e) =>
                    setForm({ ...form, otp: e.target.value })
                  }
                  placeholder="123456"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="callbackUrl">Callback URL</Label>
              <Input
                id="callbackUrl"
                value={form.callbackUrl}
                onChange={(e) =>
                  setForm({ ...form, callbackUrl: e.target.value })
                }
                placeholder="https://webhook.example.com/safehaven"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="autoSweep"
                type="checkbox"
                checked={form.autoSweep}
                onChange={(e) =>
                  setForm({ ...form, autoSweep: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="autoSweep" className="text-sm font-normal">
                Enable Auto Sweep
              </Label>
            </div>
          </>
        )}
        <DialogFooter className="pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={createSubAccount.isPending}>
            {createSubAccount.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ============== Transfers Tab ==============

function TransfersTab() {
  const { data: transfers, isLoading } = useMerchantTransfers();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transfers</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              New Transfer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <TransferForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <TransferList transfers={transfers} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface TransferItem {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  beneficiaryBankCode: string;
  beneficiaryAccountNumber: string;
  beneficiaryAccountName: string;
  narration: string;
  status: string;
  fees: { id: string; feeAmount: number; feeType: string; feeCurrency: string }[];
  totalFees: number;
  netAmount: number;
  createdAt: string;
  completedAt?: string;
}

function statusColor(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-green-500/10 text-green-500 border border-green-500/20";
    case "PENDING":
    case "PROCESSING":
      return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
    case "FAILED":
      return "bg-red-500/10 text-red-500 border border-red-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20";
  }
}

function TransferList({ transfers }: { transfers: any }) {
  const items: TransferItem[] = Array.isArray(transfers)
    ? transfers
    : transfers?.data && Array.isArray(transfers.data)
      ? transfers.data
      : [];
  const meta = transfers?.meta;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <ArrowRightLeft className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No transfers yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y">
        {items.map((t, i) => (
          <div key={t.id ?? t.reference ?? i} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="font-medium">
                  {t.currency === "NGN" ? "₦" : t.currency}{" "}
                  {t.amount.toLocaleString()}
                </p>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(t.status)}`}>
                  {t.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t.createdAt
                  ? format(new Date(t.createdAt), "MMM d, yyyy HH:mm")
                  : "N/A"}
              </p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="space-x-4 text-muted-foreground">
                <span>{t.beneficiaryAccountName}</span>
                <span className="text-xs">
                  {t.beneficiaryBankCode} &middot; {t.beneficiaryAccountNumber}
                </span>
              </div>
              <span className="text-muted-foreground">
                Net: {t.currency === "NGN" ? "₦" : t.currency}{" "}
                {(t.netAmount ?? t.amount).toLocaleString()}
                {(t.totalFees ?? 0) > 0 && (
                  <span className="text-xs ml-1">
                    (fee: {t.currency === "NGN" ? "₦" : t.currency}
                    {(t.totalFees ?? 0).toLocaleString()})
                  </span>
                )}
              </span>
            </div>
            {t.narration && (
              <p className="text-xs text-muted-foreground">{t.narration}</p>
            )}
          </div>
        ))}
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </span>
        </div>
      )}
    </div>
  );
}

function TransferForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const nameEnquiry = useResolveAccount();
  const transfer = useTransfer();
  const { data: banks = [] } = useBanks();
  const [verifiedName, setVerifiedName] = useState("");
  const [form, setForm] = useState({
    beneficiaryBankCode: "",
    beneficiaryAccountNumber: "",
    amount: "",
    narration: "",
    paymentReference: "",
    saveBeneficiary: false,
    debitAccountNumber: "",
  });

  const handleNameEnquiry = async () => {
    if (!form.beneficiaryBankCode || !form.beneficiaryAccountNumber) {
      toast({
        title: "Error",
        description: "Please enter bank code and account number.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await nameEnquiry.mutateAsync({
        bankCode: form.beneficiaryBankCode,
        accountNumber: form.beneficiaryAccountNumber,
      });
      const accountName = res.data?.data?.accountName;
      if (!accountName) {
        toast({
          title: "Error",
          description: "Could not resolve account name.",
          variant: "destructive",
        });
        return;
      }
      setVerifiedName(accountName);
      toast({
        title: "Verified",
        description: `Account name: ${accountName}`,
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Name enquiry failed.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedName) {
      toast({
        title: "Error",
        description: "Please verify the beneficiary account first.",
        variant: "destructive",
      });
      return;
    }
    try {
      await transfer.mutateAsync({
        beneficiaryBankCode: form.beneficiaryBankCode,
        beneficiaryAccountNumber: form.beneficiaryAccountNumber,
        amount: Number(form.amount),
        narration: form.narration,
        paymentReference: form.paymentReference,
        saveBeneficiary: form.saveBeneficiary,
        debitAccountNumber: form.debitAccountNumber || undefined,
      });
      toast({
        title: "Success",
        description: "Transfer initiated successfully.",
        variant: "success",
      });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Transfer failed.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>New Transfer</DialogTitle>
        <DialogDescription>
          Transfer funds from your merchant account to a beneficiary.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label>Bank</Label>
          <SearchableBankSelect
            banks={banks}
            value={form.beneficiaryBankCode}
            onValueChange={(code) => {
              setForm({ ...form, beneficiaryBankCode: code });
              setVerifiedName("");
            }}
            placeholder="Search and select a bank"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="accountNumber">Account Number</Label>
          <Input
            id="accountNumber"
            value={form.beneficiaryAccountNumber}
            onChange={(e) =>
              setForm({ ...form, beneficiaryAccountNumber: e.target.value })
            }
            placeholder="0123456789"
            required
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleNameEnquiry}
          disabled={nameEnquiry.isPending}
          className="w-full"
        >
          {nameEnquiry.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          {verifiedName || "Verify Account"}
        </Button>
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (₦)</Label>
          <Input
            id="amount"
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="5000"
            required
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="narration">Narration</Label>
          <Input
            id="narration"
            value={form.narration}
            onChange={(e) => setForm({ ...form, narration: e.target.value })}
            placeholder="Payment for services"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paymentReference">Payment Reference</Label>
          <Input
            id="paymentReference"
            value={form.paymentReference}
            onChange={(e) =>
              setForm({ ...form, paymentReference: e.target.value })
            }
            placeholder="ref-123456"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="debitAccountNumber">
            Debit Account (optional)
          </Label>
          <Input
            id="debitAccountNumber"
            value={form.debitAccountNumber}
            onChange={(e) =>
              setForm({ ...form, debitAccountNumber: e.target.value })
            }
            placeholder="Leave empty to use main account"
          />
        </div>
        <DialogFooter className="pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={transfer.isPending}>
            {transfer.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Transfer
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ============== Virtual Accounts Tab ==============

function VirtualAccountsTab() {
  const { toast } = useToast();
  const createVirtualAccount = useCreateVirtualAccount();
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({
    amount: "",
    validFor: "3600",
    externalReference: "",
    amountControl: "OverPayment" as const,
    callbackUrl: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createVirtualAccount.mutateAsync({
        amount: Number(form.amount),
        validFor: Number(form.validFor),
        externalReference: form.externalReference || undefined,
        amountControl: form.amountControl,
        callbackUrl: form.callbackUrl || undefined,
      });
      setResult(res.data);
      toast({
        title: "Success",
        description: "Virtual account created successfully.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Failed to create virtual account.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Dynamic Virtual Account</CardTitle>
          <CardDescription>
            Create a virtual account for accepting payments. SafeHaven only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vaAmount">Amount (₦)</Label>
                <Input
                  id="vaAmount"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="5000"
                  required
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validFor">Valid For (seconds)</Label>
                <Input
                  id="validFor"
                  type="number"
                  value={form.validFor}
                  onChange={(e) =>
                    setForm({ ...form, validFor: e.target.value })
                  }
                  placeholder="3600"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="externalReference">External Reference</Label>
                <Input
                  id="externalReference"
                  value={form.externalReference}
                  onChange={(e) =>
                    setForm({ ...form, externalReference: e.target.value })
                  }
                  placeholder="ref-123456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amountControl">Amount Control</Label>
                <Select
                  value={form.amountControl}
                  onValueChange={(v: any) =>
                    setForm({ ...form, amountControl: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="UnderPayment">UnderPayment</SelectItem>
                    <SelectItem value="OverPayment">OverPayment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vaCallbackUrl">Callback URL</Label>
              <Input
                id="vaCallbackUrl"
                value={form.callbackUrl}
                onChange={(e) =>
                  setForm({ ...form, callbackUrl: e.target.value })
                }
                placeholder="https://webhook.example.com/safehaven"
              />
            </div>
            <Button type="submit" disabled={createVirtualAccount.isPending}>
              {createVirtualAccount.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Virtual Account
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Virtual Account Created</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============== Identity Tab ==============

function IdentityTab() {
  const { toast } = useToast();
  const verifyIdentity = useInitiateVerification();
  const validateIdentity = useValidateVerification();
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyForm, setVerifyForm] = useState<{
    type: "BVN" | "NIN" | "vNIN" | "BVNUSSD" | "CAC" | "CREDITCHECK";
    number: string;
    otp: string;
    verifierId: string;
  }>({
    type: "BVN",
    number: "",
    otp: "",
    verifierId: "",
  });
  const [validateForm, setValidateForm] = useState<{
    identityId: string;
    type: "BVN" | "NIN";
    otp: string;
  }>({
    identityId: "",
    type: "BVN",
    otp: "",
  });

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await verifyIdentity.mutateAsync({
        type: verifyForm.type,
        number: verifyForm.number,
        otp: verifyForm.otp || undefined,
        verifierId: verifyForm.verifierId || undefined,
      });
      setVerifyResult(res.data);
      toast({
        title: "Verification Initiated",
        description: "Check the response for identityId.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Identity verification failed.",
        variant: "destructive",
      });
    }
  };

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await validateIdentity.mutateAsync(validateForm);
      toast({
        title: "Success",
        description: "Identity validated successfully.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Identity validation failed.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Verify Identity</CardTitle>
          <CardDescription>
            Initiate BVN/NIN verification. SafeHaven only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="idType">Type</Label>
              <Select
                value={verifyForm.type}
                onValueChange={(v: any) =>
                  setVerifyForm({ ...verifyForm, type: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BVN">BVN</SelectItem>
                  <SelectItem value="NIN">NIN</SelectItem>
                  <SelectItem value="vNIN">vNIN</SelectItem>
                  <SelectItem value="BVNUSSD">BVNUSSD</SelectItem>
                  <SelectItem value="CAC">CAC</SelectItem>
                  <SelectItem value="CREDITCHECK">CREDITCHECK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="idNumber">Number</Label>
              <Input
                id="idNumber"
                value={verifyForm.number}
                onChange={(e) =>
                  setVerifyForm({ ...verifyForm, number: e.target.value })
                }
                placeholder="22222222222"
                required
              />
            </div>
            {verifyForm.type === "BVNUSSD" && (
              <div className="space-y-2">
                <Label htmlFor="idOtp">OTP</Label>
                <Input
                  id="idOtp"
                  value={verifyForm.otp}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, otp: e.target.value })
                  }
                  placeholder="123456"
                />
              </div>
            )}
            {verifyForm.type === "vNIN" && (
              <div className="space-y-2">
                <Label htmlFor="verifierId">Verifier ID</Label>
                <Input
                  id="verifierId"
                  value={verifyForm.verifierId}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, verifierId: e.target.value })
                  }
                />
              </div>
            )}

            <Button type="submit" disabled={verifyIdentity.isPending}>
              {verifyIdentity.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Verify
            </Button>
          </form>
          {verifyResult && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-1">Response:</p>
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto">
                {JSON.stringify(verifyResult, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validate Identity</CardTitle>
          <CardDescription>
            Validate identity verification with OTP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleValidate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identityId">Identity ID</Label>
              <Input
                id="identityId"
                value={validateForm.identityId}
                onChange={(e) =>
                  setValidateForm({ ...validateForm, identityId: e.target.value })
                }
                placeholder="id-123"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validateType">Type</Label>
              <Select
                value={validateForm.type}
                onValueChange={(v: any) =>
                  setValidateForm({ ...validateForm, type: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BVN">BVN</SelectItem>
                  <SelectItem value="NIN">NIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="validateOtp">OTP</Label>
              <Input
                id="validateOtp"
                value={validateForm.otp}
                onChange={(e) =>
                  setValidateForm({ ...validateForm, otp: e.target.value })
                }
                placeholder="123456"
                required
              />
            </div>
            <Button type="submit" disabled={validateIdentity.isPending}>
              {validateIdentity.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Validate
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
