import type { Metadata } from "next";
import { JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { Toaster } from "@/components/ui/toast";
import { AuthProvider } from "@/components/auth/auth-provider";
import { WagmiProviderWrapper } from "@/components/providers/wagmi-provider";
import { TopLoader } from "@/components/providers/top-loader";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage-grotesque",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AutoRamp | Onramp & Offramp",
  description:
    "Convert fiat to crypto and crypto to fiat seamlessly with AutoRamp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jetbrainsMono.variable} ${bricolageGrotesque.variable} antialiased`}
      >
        <TopLoader />
        <WagmiProviderWrapper>
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </QueryProvider>
        </WagmiProviderWrapper>
      </body>
    </html>
  );
}
