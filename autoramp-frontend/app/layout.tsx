import type { Metadata } from "next";
import { JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { RootProvider } from "@/components/providers/root-provider";
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
  other: {
    'base:app_id': '6967e0780c770beef04862ab',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${jetbrainsMono.variable} ${bricolageGrotesque.variable} antialiased`}
        suppressHydrationWarning
      >
        <TopLoader />
        <RootProvider>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
