"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useMerchantSubAccount,
  useMerchantSubAccountTransfers,
  useMerchantSubAccountTransactions,
} from "@/lib/hooks/use-merchant-bank";
import { Loader2, ChevronLeft, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { UpdateSubAccountForm } from "@/components/merchant/bank/UpdateSubAccountForm";

export default function SubAccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: subAccount, isLoading } = useMerchantSubAccount(id);
  const { data: transfers } = useMerchantSubAccountTransfers(id);
  const { data: transactions } = useMerchantSubAccountTransactions(id);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!subAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-muted-foreground">Sub-account not found.</p>
        <Button asChild variant="outline">
          <Link href="/merchant/dashboard/bank">Back to Banking</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/merchant/dashboard/bank">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{subAccount.accountName}</h1>
          <p className="text-sm text-muted-foreground">
            {subAccount.bankName} — {subAccount.accountNumber}
          </p>
        </div>
        <UpdateSubAccountForm
          subAccount={{
            id: subAccount.id,
            accountNumber: subAccount.accountNumber,
            accountName: subAccount.accountName,
            bankName: subAccount.bankName,
            bankCode: subAccount.bankCode,
            autoSweep: (subAccount as any).autoSweep,
            phoneNumber: (subAccount as any).phoneNumber,
            emailAddress: (subAccount as any).emailAddress,
            externalReference: (subAccount as any).externalReference,
            callbackUrl: (subAccount as any).callbackUrl,
          }}
          mode="merchant"
        />
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₦{subAccount.accountBalance?.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Book Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₦{subAccount.bookBalance?.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold capitalize">
              {subAccount.status || "Active"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bank Code</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{subAccount.bankCode}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="transfers">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto">
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="transfers">
          <Card>
            <CardContent className="p-0">
              <TransferList transfers={transfers} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="transactions">
          <Card>
            <CardContent className="p-0">
              {!transactions || !transactions.data || transactions.data.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  No transactions yet.
                </div>
              ) : (
                <div className="divide-y">
                  {transactions.data.map((tx: any) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 text-sm"
                    >
                      <div>
                        <span className="font-medium capitalize">{tx.type}</span>
                        <span className="mx-2">—</span>
                        <span>₦{tx.amount?.toLocaleString()}</span>
                        <p className="text-muted-foreground">
                          {tx.reference}
                        </p>
                      </div>
                      <span className="text-muted-foreground">{tx.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TransferList({ transfers }: { transfers: any }) {
  const items = Array.isArray(transfers)
    ? transfers
    : transfers?.data && Array.isArray(transfers.data)
      ? transfers.data
      : [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <ArrowRightLeft className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No transfers yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {items.map((t: any, i: number) => (
        <div key={i} className="flex items-center justify-between p-4 text-sm">
          <div>
            <span className="font-medium">
              ₦{t.amount?.toLocaleString()}
            </span>
            <p className="text-muted-foreground">
              {t.narration || "Transfer"}
            </p>
          </div>
          <span className="text-muted-foreground">{t.status || "Pending"}</span>
        </div>
      ))}
    </div>
  );
}
