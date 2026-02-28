"use client";

import { InitiateOtcForm } from "@/components/otc/initiate-otc-form";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { AlertCircle, ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export default function OtcTradePage() {
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
                    <div className="flex items-center justify-center gap-4 text-sm mt-4">
                        <Link href="mailto:dev@thebuidlgrid.org" className="hover:text-primary transition-colors">Support: dev@thebuidlgrid.org</Link>
                        <span>•</span>
                        <span>© {new Date().getFullYear()} AutoRamp / The Buidl Grid</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
