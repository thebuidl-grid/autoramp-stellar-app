"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/components/ui/toast";
import {
  useVASServices,
  useVASCategories,
  useVASProducts,
  useVASVerify,
  useVASPayAirtime,
  useVASPayData,
  useVASPayCableTv,
  useVASPayUtility,
  useVASTransactions,
  useVASTransactionSync,
} from "@/lib/hooks/use-vas";
import type { VASService, VASCategory, VASProduct, VASTransaction } from "@/lib/merchant";
import { useMerchantBankAccount } from "@/lib/hooks/use-merchant-bank";
import {
  Loader2,
  Smartphone,
  Wifi,
  Tv,
  Zap,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ArrowRight,
  Search,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const SERVICE_COLORS: Record<string, string> = {
  Airtime: "from-blue-500/20 to-blue-600/5 border-blue-500/30",
  Data: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30",
  "Cable TV": "from-purple-500/20 to-purple-600/5 border-purple-500/30",
  Utility: "from-amber-500/20 to-amber-600/5 border-amber-500/30",
};

function getServiceColorClass(name: string): string {
  const normalized = name.toLowerCase().trim();
  if (normalized.includes("airtime") || normalized.includes("recharge") || normalized.includes("mobile")) return SERVICE_COLORS.Airtime;
  if (normalized.includes("data") || normalized.includes("internet")) return SERVICE_COLORS.Data;
  if (normalized.includes("cable") || normalized.includes("tv")) return SERVICE_COLORS["Cable TV"];
  if (normalized.includes("util") || normalized.includes("bill") || normalized.includes("power") || normalized.includes("electric")) return SERVICE_COLORS.Utility;
  return "from-zinc-500/20 to-zinc-600/5 border-zinc-500/30";
}

function ServiceIllustration({ name }: { name: string }) {
  const normalized = name.toLowerCase().trim();
  const isAirtime = normalized.includes("airtime") || normalized.includes("recharge") || normalized.includes("mobile");
  const isData = normalized.includes("data") || normalized.includes("internet");
  const isCableTv = normalized.includes("cable") || normalized.includes("tv");
  const isUtility = normalized.includes("util") || normalized.includes("bill") || normalized.includes("power") || normalized.includes("electric");

  if (isAirtime) {
    return (
      <div className="relative w-full h-32 mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500/30 via-blue-600/10 to-blue-400/5 flex items-center justify-center">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-3 left-4 w-16 h-16 rounded-full bg-blue-400/40 blur-xl" />
          <div className="absolute bottom-2 right-4 w-20 h-20 rounded-full bg-blue-300/30 blur-2xl" />
        </div>
        <div className="relative flex items-center gap-2">
          <div className="w-12 h-20 rounded-xl border-2 border-blue-400/50 bg-blue-900/30 flex flex-col items-center justify-center gap-1">
            <div className="w-6 h-6 rounded-full border border-blue-400/40 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-blue-400/60" />
            </div>
            <div className="w-4 h-0.5 rounded bg-blue-400/30" />
            <div className="w-4 h-0.5 rounded bg-blue-400/30" />
          </div>
          <div className="flex flex-col items-center">
            <Smartphone className="h-8 w-8 text-blue-400" />
            <div className="mt-1 flex items-center gap-0.5">
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:0.2s]" />
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:0.4s]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isData) {
    return (
      <div className="relative w-full h-32 mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-emerald-500/30 via-emerald-600/10 to-emerald-400/5 flex items-center justify-center">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-4 right-6 w-14 h-14 rounded-full bg-emerald-400/40 blur-xl" />
          <div className="absolute bottom-3 left-5 w-18 h-18 rounded-full bg-emerald-300/30 blur-2xl" />
        </div>
        <div className="relative flex items-center gap-3">
          <Wifi className="h-10 w-10 text-emerald-400" />
          <div className="flex flex-col gap-1">
            {[36, 28, 20, 12].map((w, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="h-1.5 rounded-full bg-emerald-400/60" style={{ width: `${w}px` }} />
                {i === 0 && <span className="text-[8px] text-emerald-300/80 font-mono">5G</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isCableTv) {
    return (
      <div className="relative w-full h-32 mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/30 via-purple-600/10 to-purple-400/5 flex items-center justify-center">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-3 left-6 w-16 h-16 rounded-full bg-purple-400/40 blur-xl" />
          <div className="absolute bottom-2 right-3 w-20 h-20 rounded-full bg-purple-300/30 blur-2xl" />
        </div>
        <div className="relative flex items-center gap-3">
          <div className="w-20 h-14 rounded-lg border-2 border-purple-400/50 bg-purple-900/30 flex items-center justify-center">
            <Tv className="h-7 w-7 text-purple-400" />
          </div>
          <div className="flex flex-col gap-1.5">
            {["HD", "4K"].map((label, i) => (
              <div key={i} className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-400/20 text-purple-300 border border-purple-400/30">
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isUtility) {
    return (
      <div className="relative w-full h-32 mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-amber-500/30 via-amber-600/10 to-amber-400/5 flex items-center justify-center">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-4 left-3 w-16 h-16 rounded-full bg-amber-400/40 blur-xl" />
          <div className="absolute bottom-3 right-5 w-20 h-20 rounded-full bg-amber-300/30 blur-2xl" />
        </div>
        <div className="relative flex items-center gap-3">
          <Zap className="h-10 w-10 text-amber-400" />
          <div className="flex flex-col gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/50" />
                <div className="h-1 rounded-full bg-amber-400/40" style={{ width: `${40 - i * 6}px` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-32 mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-zinc-500/30 via-zinc-600/10 to-zinc-400/5 flex items-center justify-center">
      <Smartphone className="h-10 w-10 text-zinc-400" />
    </div>
  );
}

function statusColor(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-green-500/10 text-green-500 border border-green-500/20";
    case "PENDING":
    case "PROCESSING":
      return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
    case "FAILED":
    case "CANCELLED":
      return "bg-red-500/10 text-red-500 border border-red-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20";
  }
}

export default function MerchantVASPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Value Added Services</h1>
        <p className="text-muted-foreground">
          Purchase airtime, data, pay bills, and manage utilities.
        </p>
      </div>

      <Tabs defaultValue="services" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-2 lg:w-auto">
          <TabsTrigger value="services">Buy Services</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          <VASFlow />
        </TabsContent>
        <TabsContent value="transactions">
          <VASTransactionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== VAS Purchase Flow ==============

type FlowStep = "service" | "category" | "product" | "verify" | "pay" | "result";

interface FlowState {
  step: FlowStep;
  service: VASService | null;
  category: VASCategory | null;
  product: VASProduct | null;
  verifyResult: any;
  payResult: any;
}

function VASFlow() {
  const [flow, setFlow] = useState<FlowState>({
    step: "service",
    service: null,
    category: null,
    product: null,
    verifyResult: null,
    payResult: null,
  });

  const reset = () =>
    setFlow({ step: "service", service: null, category: null, product: null, verifyResult: null, payResult: null });

  const setService = (s: VASService) => setFlow((f) => ({ ...f, step: "category", service: s, category: null, product: null, verifyResult: null }));
  const setCategory = (c: VASCategory) => {
    const needsProduct = flow.service?.name === "Data" || flow.service?.name === "Cable TV";
    setFlow((f) => ({ ...f, step: needsProduct ? "product" : "pay", category: c, product: null }));
  };
  const setProduct = (p: VASProduct) => {
    const needsVerify = flow.service?.name === "Cable TV" || flow.service?.name === "Utility";
    setFlow((f) => ({ ...f, step: needsVerify ? "verify" : "pay", product: p }));
  };
  const setVerifyResult = (r: any) => setFlow((f) => ({ ...f, step: "pay", verifyResult: r }));
  const setPayResult = (r: any) => setFlow((f) => ({ ...f, step: "result", payResult: r }));

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      {flow.step !== "result" && (
        <StepIndicator currentStep={flow.step} />
      )}

      {flow.step === "service" && <ServiceSelection onSelect={setService} />}
      {flow.step === "category" && (
        <CategorySelection
          service={flow.service!}
          onSelect={setCategory}
          onBack={() => setFlow((f) => ({ ...f, step: "service", category: null }))}
        />
      )}
      {flow.step === "product" && (
        <ProductSelection
          service={flow.service!}
          category={flow.category!}
          onSelect={setProduct}
          onBack={() => setFlow((f) => ({ ...f, step: "category", product: null }))}
        />
      )}
      {flow.step === "verify" && (
        <VerifyStep
          service={flow.service!}
          category={flow.category!}
          product={flow.product}
          onVerified={setVerifyResult}
          onBack={() => setFlow((f) => ({ ...f, step: flow.product ? "product" : "category", verifyResult: null }))}
        />
      )}
      {flow.step === "pay" && (
        <PayStep
          service={flow.service!}
          category={flow.category!}
          product={flow.product}
          verifyResult={flow.verifyResult}
          onPaid={setPayResult}
          onBack={() => setFlow((f) => ({ ...f, step: f.verifyResult ? "verify" : (f.product ? "product" : "category") }))}
        />
      )}
      {flow.step === "result" && (
        <ResultStep result={flow.payResult} onDone={reset} />
      )}
    </div>
  );
}

// ============== Step Indicator ==============

const STEPS: { key: FlowStep; label: string }[] = [
  { key: "service", label: "Service" },
  { key: "category", label: "Provider" },
  { key: "product", label: "Product" },
  { key: "pay", label: "Pay" },
];

function StepIndicator({ currentStep }: { currentStep: FlowStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                isDone
                  ? "bg-green-500/20 text-green-500 border border-green-500/30"
                  : isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:inline ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
          </div>
        );
      })}
    </div>
  );
}

// ============== Step 1: Service Selection ==============

function ServiceSelection({ onSelect }: { onSelect: (s: VASService) => void }) {
  const { data: services, isLoading } = useVASServices();

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select a Service</CardTitle>
        <CardDescription>Choose what you want to purchase or pay for.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services?.map((service) => {
            const colorClass = getServiceColorClass(service.name);
            return (
              <button
                key={service._id}
                onClick={() => onSelect(service)}
                className={`group relative p-4 rounded-xl border bg-gradient-to-b transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer ${colorClass}`}
              >
                <ServiceIllustration name={service.name} />
                <p className="font-semibold text-foreground">{service.name}</p>
                {service.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============== Step 2: Category/Provider Selection ==============

function CategorySelection({
  service,
  onSelect,
  onBack,
}: {
  service: VASService;
  onSelect: (c: VASCategory) => void;
  onBack: () => void;
}) {
  const { data: categories, isLoading } = useVASCategories(service._id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">{service.name} - Select Provider</h2>
          <p className="text-sm text-muted-foreground">Choose your service provider</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories?.map((cat) => (
                <button
                  key={cat._id}
                  onClick={() => onSelect(cat)}
                  className="p-4 rounded-xl border border-white/10 bg-white/5 text-left transition-all hover:bg-white/10 hover:scale-[1.01]"
                >
                  <p className="font-semibold text-foreground">{cat.name}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============== Step 3: Product/Bundle Selection ==============

function ProductSelection({
  service,
  category,
  onSelect,
  onBack,
}: {
  service: VASService;
  category: VASCategory;
  onSelect: (p: VASProduct) => void;
  onBack: () => void;
}) {
  const { data: products, isLoading } = useVASProducts(category._id);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!products) return [];
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [products, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">{category.name} - Select {service.name === "Cable TV" ? "Plan" : "Bundle"}</h2>
          <p className="text-sm text-muted-foreground">Choose an option below</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search bundles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
              {filtered.map((product) => (
                <button
                  key={product.code}
                  onClick={() => onSelect(product)}
                  className="p-4 rounded-xl border border-white/10 bg-white/5 text-left transition-all hover:bg-white/10 hover:scale-[1.01]"
                >
                  <p className="font-semibold text-foreground">{product.name}</p>
                  <p className="text-sm text-primary font-medium mt-1">
                    ₦{product.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{product.code}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============== Step 4: Verify (Cable TV / Utility) ==============

function VerifyStep({
  service,
  category,
  product,
  onVerified,
  onBack,
}: {
  service: VASService;
  category: VASCategory;
  product: VASProduct | null;
  onVerified: (result: any) => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const verify = useVASVerify();
  const [entityNumber, setEntityNumber] = useState("");

  const isCableTv = service.name === "Cable TV";
  const label = isCableTv ? "Smartcard Number" : "Meter Number";

  const handleVerify = async () => {
    if (!entityNumber.trim()) {
      toast({ title: "Error", description: `Please enter a ${label}.`, variant: "destructive" });
      return;
    }
    try {
      const res = await verify.mutateAsync({
        serviceCategoryId: category._id,
        entityNumber: entityNumber.trim(),
      });
      toast({ title: "Verified", description: "Account verified successfully.", variant: "success" });
      onVerified(res.data);
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error?.response?.data?.message || "Could not verify account.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Verify {label}</h2>
          <p className="text-sm text-muted-foreground">
            Enter your {label.toLowerCase()} to validate before payment
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>{label}</Label>
            <Input
              value={entityNumber}
              onChange={(e) => setEntityNumber(e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}`}
            />
          </div>
          <Button onClick={handleVerify} disabled={verify.isPending || !entityNumber.trim()} className="w-full">
            {verify.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Verify Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== Step 5: Pay ==============

function PayStep({
  service,
  category,
  product,
  verifyResult,
  onPaid,
  onBack,
}: {
  service: VASService;
  category: VASCategory;
  product: VASProduct | null;
  verifyResult: any;
  onPaid: (result: any) => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const { data: account } = useMerchantBankAccount();
  const payAirtime = useVASPayAirtime();
  const payData = useVASPayData();
  const payCableTv = useVASPayCableTv();
  const payUtility = useVASPayUtility();

  const [form, setForm] = useState({
    phoneNumber: "",
    amount: product?.amount?.toString() || "",
    debitAccountNumber: account?.accountNumber || "",
  });

  const isAirtime = service.name === "Airtime";
  const isData = service.name === "Data";
  const isCableTv = service.name === "Cable TV";
  const isUtility = service.name === "Utility";

  const isLoading = payAirtime.isPending || payData.isPending || payCableTv.isPending || payUtility.isPending;

  const handleSubmit = async () => {
    const base = {
      serviceCategoryId: category._id,
      amount: Number(form.amount),
      debitAccountNumber: form.debitAccountNumber,
      channel: "WEB" as const,
    };

    try {
      let result;
      if (isAirtime) {
        if (!form.phoneNumber) {
          toast({ title: "Error", description: "Phone number is required.", variant: "destructive" });
          return;
        }
        result = await payAirtime.mutateAsync({ ...base, phoneNumber: form.phoneNumber });
      } else if (isData) {
        if (!form.phoneNumber) {
          toast({ title: "Error", description: "Phone number is required.", variant: "destructive" });
          return;
        }
        result = await payData.mutateAsync({
          ...base,
          bundleCode: product!.code,
          phoneNumber: form.phoneNumber,
        });
      } else if (isCableTv) {
        result = await payCableTv.mutateAsync({
          ...base,
          bundleCode: product!.code,
          cardNumber: verifyResult?.customerName ? entityNumberFromVerify(verifyResult) : "",
        });
      } else if (isUtility) {
        result = await payUtility.mutateAsync({
          ...base,
          meterNumber: verifyResult?.meterDetails?.meterNumber || "",
          vendType: "prepaid",
        });
      }
      toast({ title: "Payment Submitted", description: "Your request is being processed.", variant: "success" });
      onPaid(result?.data);
    } catch (error: any) {
      toast({
        title: "Payment Failed",
        description: error?.response?.data?.message || "Could not process payment.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Confirm Payment</h2>
          <p className="text-sm text-muted-foreground">Review and complete your {service.name.toLowerCase()} purchase</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Summary */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium">{service.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">{category.name}</span>
            </div>
            {product && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{product.name}</span>
              </div>
            )}
            {verifyResult?.customerName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Name</span>
                <span className="font-medium">{verifyResult.customerName}</span>
              </div>
            )}
          </div>

          {/* Phone number for airtime/data */}
          {(isAirtime || isData) && (
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="08012345678"
              />
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₦)</Label>
            <Input
              id="amount"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0"
              disabled={!!product?.amount}
            />
          </div>

          {/* Debit Account */}
          <div className="space-y-2">
            <Label htmlFor="debitAccount">Debit Account</Label>
            <Input
              id="debitAccount"
              value={form.debitAccountNumber}
              onChange={(e) => setForm({ ...form, debitAccountNumber: e.target.value })}
              placeholder="Account number"
            />
          </div>

          <Button onClick={handleSubmit} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Pay ₦{Number(form.amount || 0).toLocaleString()}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function entityNumberFromVerify(result: any): string {
  return result?.meterDetails?.meterNumber || result?.cardNumber || "";
}

// ============== Step 6: Result ==============

function ResultStep({ result, onDone }: { result: any; onDone: () => void }) {
  const isProcessing = result?.status === "PROCESSING";
  const isFailed = result?.status === "FAILED";

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col items-center py-10 space-y-4">
        {isFailed ? (
          <XCircle className="h-16 w-16 text-red-500" />
        ) : isProcessing ? (
          <Clock className="h-16 w-16 text-amber-500 animate-pulse" />
        ) : (
          <CheckCircle2 className="h-16 w-16 text-green-500" />
        )}
        <h2 className="text-xl font-semibold">
          {isFailed ? "Payment Failed" : isProcessing ? "Processing..." : "Payment Successful"}
        </h2>
        {result?.reference && (
          <p className="text-sm text-muted-foreground">Reference: {result.reference}</p>
        )}
        {result?.transactionId && (
          <p className="text-xs text-muted-foreground">ID: {result.transactionId}</p>
        )}
        <Button onClick={onDone} className="mt-4">
          Done
        </Button>
      </CardContent>
    </Card>
  );
}

// ============== VAS Transactions Tab ==============

function VASTransactionsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useVASTransactions({ page, limit: 15 });
  const syncMutation = useVASTransactionSync();
  const { toast } = useToast();

  const items = data?.data || [];
  const pagination = data?.pagination;

  const handleSync = async (txnId: string) => {
    try {
      await syncMutation.mutateAsync(txnId);
      toast({ title: "Synced", description: "Transaction status updated.", variant: "success" });
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error?.response?.data?.message || "Could not sync transaction.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <p className="text-muted-foreground">No VAS transactions yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map((txn: VASTransaction) => (
                <div key={txn.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <p className="font-medium">
                        {txn.currency === "NGN" ? "₦" : txn.currency}{" "}
                        {txn.amount.toLocaleString()}
                      </p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(txn.status)}`}>
                        {txn.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {txn.createdAt
                        ? format(parseISO(txn.createdAt), "MMM d, yyyy HH:mm")
                        : "N/A"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <span className="capitalize">{txn.serviceType}</span>
                      {txn.phoneNumber && <span>{txn.phoneNumber}</span>}
                      {txn.meterNumber && <span>Meter: {txn.meterNumber}</span>}
                      {txn.cardNumber && <span>Card: {txn.cardNumber}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{txn.reference}</span>
                      {(txn.status === "PROCESSING" || txn.status === "PENDING") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleSync(txn.id)}
                          disabled={syncMutation.isPending}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
