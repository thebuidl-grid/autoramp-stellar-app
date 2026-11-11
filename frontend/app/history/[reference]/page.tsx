"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { OfframpDetailLoader } from "@/components/offramp/offramp-detail-loader";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";

/** Transaction detail: one cash-out's full persisted state. Reload-safe (state comes from the API). */
export default function TransactionDetailPage() {
  const router = useRouter();
  const params = useParams<{ reference: string }>();
  const isAuthenticated = useIsAuthenticated();
  const { _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push("/");
  }, [isAuthenticated, _hasHydrated, router]);

  if (!_hasHydrated || !isAuthenticated) return null;

  const reference = decodeURIComponent(params.reference);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/history" className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-4">
            <ArrowLeft className="w-4 h-4" /> Transaction history
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Cash-out details</h1>
          <p className="text-white/60 text-sm mb-6 font-mono break-all">{reference}</p>
          <div className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 p-4 md:p-6">
            <OfframpDetailLoader reference={reference} />
          </div>
        </div>
      </div>
    </div>
  );
}
