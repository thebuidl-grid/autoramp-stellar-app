import { MerchantShell } from "@/components/merchant/layout/MerchantShell";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <MerchantShell>{children}</MerchantShell>;
}
