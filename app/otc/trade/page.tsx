"use client";

import { InitiateOtcForm } from "@/components/otc/initiate-otc-form";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { AlertCircle, ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export default function OtcTradePage() {
    const isAuthenticated = useIsAuthenticated();
    const { _hasHydrated } = useAuthStore();

    if (!_hasHydrated) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-black text-white selection:bg-primary/30 flex items-center justify-center p-4">
                {/* Background Decor */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
                </div>

                <div className="relative z-10 max-w-md w-full bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-8 md:p-12 text-center space-y-8">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="p-4 bg-red-500/10 rounded-2xl">
                            <AlertCircle className="h-12 w-12 text-red-500" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter">Please Login</h2>
                        <p className="text-zinc-400">
                            You must be logged in to access OTC features. Please sign in to continue.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Button asChild className="w-full py-6 rounded-2xl font-bold text-lg">
                            <Link href="/auth/login" className="flex items-center justify-center gap-2">
                                Go to Login
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full py-6 rounded-2xl font-bold text-lg border-white/10 hover:bg-white/5">
                            <Link href="/">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Return Home
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
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
                {/* Header Actions */}
                <div className="flex justify-start mb-8">
                    <Button asChild variant="ghost" className="text-zinc-400 hover:text-white transition-colors">
                        <Link href="/otc/onboarding" className="flex items-center gap-2">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Onboarding
                        </Link>
                    </Button>
                </div>

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
                            OTC Trading
                        </h1>
                        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                            Initiate large volume trades with competitive rates and personalized support.
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex flex-col items-center space-y-12">
                   <InitiateOtcForm />
                   
                   <Button asChild variant="outline" className="border-white/10 hover:bg-white/5 text-zinc-400 py-6 px-8 rounded-2xl group">
                       <Link href="/otc/history" className="flex items-center gap-3">
                           <History className="w-5 h-5 group-hover:text-primary transition-colors" />
                           <span className="font-bold text-lg">View Transaction History</span>
                       </Link>
                   </Button>
                </div>

                {/* Footer */}
                <div className="mt-20 text-center space-y-4">
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
