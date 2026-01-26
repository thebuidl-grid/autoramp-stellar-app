"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KYBForm } from "@/components/merchant/kyb-form";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import Image from "next/image";

export default function MerchantKYBPage() {
    const router = useRouter();
    const isAuthenticated = useIsAuthenticated();
    const { _hasHydrated } = useAuthStore();

    // Redirect to home if not authenticated (after hydration)
    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) {
            router.push("/");
        }
    }, [isAuthenticated, _hasHydrated, router]);

    // Show loading while hydrating or checking auth
    if (!_hasHydrated || !isAuthenticated) {
        return null;
    }

    return (
        <div className="min-h-screen bg-black text-white selection:bg-primary/30">
            {/* Background Decor */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
                <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-blue-500/5 rounded-full blur-[80px]" />
            </div>

            <div className="relative z-10 container mx-auto px-4 py-12">
                {/* Header */}
                <div className="flex flex-col items-center justify-center space-y-4 mb-12 text-center">
                    <div className="flex items-center gap-3">
                        <Image src="/logo.png" alt="AutoRamp" width={40} height={40} className="drop-shadow-glow" />
                        <span className="font-bold text-2xl tracking-tighter">
                            Auto<span className="text-secondary">Ramp</span>
                        </span>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent">
                            Merchant Onboarding
                        </h1>
                        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                            Complete your business verification to unlock API access and start accepting crypto payments.
                        </p>
                    </div>
                </div>

                {/* Form Container */}
                <div className="max-w-4xl mx-auto">
                    <KYBForm />
                </div>

                {/* Footer */}
                <div className="mt-20 text-center space-y-4">
                    <p className="text-zinc-500 text-sm">
                        Submission of these documents does not guarantee API access. All applications are subject to review.
                    </p>
                    <div className="flex items-center justify-center gap-6 text-zinc-400 text-xs">
                        <a href="mailto:dev@thebuidlgrid.org" className="hover:text-primary transition-colors">Support: dev@thebuidlgrid.org</a>
                        <span>•</span>
                        <span>© {new Date().getFullYear()} AutoRamp / The Buidl Grid</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
