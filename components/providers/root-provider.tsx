'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AuthProvider } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/toast";
import { WagmiProviderWrapper } from "@/components/providers/wagmi-provider";

interface RootProviderProps {
    children: ReactNode;
}

export function RootProvider({ children }: RootProviderProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // During SSR and until hydration, we render only basic structure
    // to avoid mismatch and SES/chunk load errors during boot
    if (!mounted) {
        return <div className="min-h-screen bg-black" />;
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

