import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { AdminProtected } from "@/components/auth/admin-protected";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AdminProtected>
            <div className="flex min-h-screen bg-background">
                <AdminSidebar />
                <main className="min-w-0 flex-1 lg:ml-64 px-4 pb-6 pt-16 sm:px-6 lg:p-10">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </AdminProtected>
    );
}
