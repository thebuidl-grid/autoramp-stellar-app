"use client";

import { MerchantProtected } from "@/components/auth/merchant-protected";

export default function MerchantGroupLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <MerchantProtected>
            {children}
        </MerchantProtected>
    );
}
