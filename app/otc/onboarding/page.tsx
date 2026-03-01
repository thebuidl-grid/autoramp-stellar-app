"use client";

import { OtcOnboardingForm } from "@/components/otc/otc-onboarding-form";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { useOtcStatus } from "@/lib/hooks";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export default function OtcOnboardingPage() {
    const isAuthenticated = useIsAuthenticated();
    const { _hasHydrated } = useAuthStore();
    const router = useRouter();
    const { isOTCEnabled, isOnboarded, isLoading: isOtcLoading } = useOtcStatus();

    if (!_hasHydrated || isOtcLoading) {
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

    if (!isOTCEnabled) {
        return (
            <div className="min-h-screen bg-black text-white selection:bg-primary/30 flex items-center justify-center p-4">
                {/* Background Decor */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
                </div>

                <div className="relative z-10 max-w-md w-full bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-8 md:p-12 text-center space-y-8">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="p-4 bg-yellow-500/10 rounded-2xl">
                            <AlertCircle className="h-12 w-12 text-yellow-500" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter">Access Denied</h2>
                        <p className="text-zinc-400">
                            Your account is not enabled for OTC features. Please contact support if you believe this is an error.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Button asChild className="w-full py-6 rounded-2xl font-bold text-lg">
                            <Link href="mailto:dev@thebuidlgrid.org" className="flex items-center justify-center gap-2">
                                Contact Support
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

    if (isOnboarded) {
        return (
            <div className="min-h-screen bg-black text-white selection:bg-primary/30 flex items-center justify-center p-4">
                {/* Background Decor */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
                </div>

                <div className="relative z-10 max-w-md w-full bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-8 md:p-12 text-center space-y-8">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="p-4 bg-green-500/10 rounded-2xl">
                            <CheckCircle2 className="h-12 w-12 text-green-500" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter">Already Onboarded</h2>
                        <p className="text-zinc-400">
                            You have already completed the OTC onboarding process. You can now start trading.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Button asChild className="w-full py-6 rounded-2xl font-bold text-lg">
                            <Link href="/otc/trade" className="flex items-center justify-center gap-2">
                                Go to Trading
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
                            OTC Onboarding
                        </h1>
                        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                            Complete your identity verification to unlock premium OTC trading features.
                        </p>
                    </div>
                </div>

                {/* Form Container */}
                <div className="max-w-4xl mx-auto">
                    <OtcOnboardingForm />
                </div>

                {/* Footer */}
                <div className="mt-20 text-center space-y-4">
                    <p className="text-zinc-500 text-sm">
                        Submission of identity details does not guarantee OTC access. All applications are subject to compliance review.
                    </p>
                    <div className="flex items-center justify-center gap-4 text-sm mt-8">
                        <Link href="mailto:dev@thebuidlgrid.org" className="hover:text-primary transition-colors">Support: dev@thebuidlgrid.org</Link>
                        <span>•</span>
                        <span>© {new Date().getFullYear()} AutoRamp / The Buidl Grid</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
