'use client';

// IMPORTANT: This must be imported before any @circle-fin or @stellar packages
// to disable BigNumber.DEBUG which throws on >15 significant digit numbers.
import "@/lib/bignumber-fix";

import { ReactNode, useEffect, useState } from 'react';
import { AuthProvider } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/toast";
import { WagmiProviderWrapper } from "@/components/providers/wagmi-provider";
import { syncNetworkCookie } from "@/lib/network";

interface RootProviderProps {
    children: ReactNode;
}

export function RootProvider({ children }: RootProviderProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Keep the server-readable cookie aligned with the client's choice so
        // /api routes pick the same network as the UI.
        syncNetworkCookie();
        setMounted(true);
    }, []);

    // During SSR and until hydration, render a branded splash instead of a
    // blank black screen so boot never looks broken.
    if (!mounted) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
                <div className="relative flex h-14 w-14 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00F9C7]/40" />
                    <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5">
                        <span className="h-3 w-3 rounded-full bg-[#00F9C7]" />
                    </span>
                </div>
                <div className="text-sm font-semibold tracking-widest text-white/70">
                    AUTORAMP
                </div>
                <div className="h-0.5 w-24 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-[#00F9C7]" />
                </div>
            </div>
        );
    }

    return (
        <WagmiProviderWrapper>
            <AuthProvider>
                {children}
                <Toaster />
            </AuthProvider>
        </WagmiProviderWrapper>
    );
}

