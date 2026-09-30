import { MerchantSidebar } from "@/components/merchant/layout/MerchantSidebar";

export default function MerchantLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-black/30">
            <MerchantSidebar />
            <main className="flex-1 lg:ml-64 p-6 lg:p-10">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
