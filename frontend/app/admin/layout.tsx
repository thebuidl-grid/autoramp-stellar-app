import { AdminShell } from "@/components/admin/layout/AdminShell";
import { AdminProtected } from "@/components/auth/admin-protected";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProtected>
      <AdminShell>{children}</AdminShell>
    </AdminProtected>
  );
}
