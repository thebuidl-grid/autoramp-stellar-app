import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import Footer from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Cash out USDC to KES | AutoRamp Guide",
  description:
    "Step-by-step guide to turning USDC into Kenyan shillings with AutoRamp, paid to your bank account or M-Pesa.",
};

const LAST_UPDATED = "November 19, 2026";
const CONTACT_EMAIL = "dev@thebuidlgrid.org";

const steps: { title: string; body: string; image?: { src: string; alt: string } }[] = [
  {
    title: "Get a wallet",
    body: "Install Varial (it used to be called Freighter) from Google Play. Open it, create your wallet, and keep your recovery phrase somewhere safe. Never share it with anyone. Then put some USDC in the wallet.",
  },
  {
    title: "Activate USDC in your wallet",
    body: "A Stellar wallet can only hold USDC after you add it. This is called activating a trustline. In Varial, add USDC as an asset and approve it. You also need a small amount of XLM, Stellar's own coin, in the wallet to pay the network's small setup cost.",
  },
  {
    title: "Open AutoRamp and tap Sell",
    body: "Go to useautoramp.com and tap Sell at the top of the box.",
    image: { src: "/guide/step-3-sell.jpg", alt: "AutoRamp with the Sell tab selected" },
  },
  {
    title: "Choose what you send and what you receive",
    body: "Tap the USDC button and choose USDC on Stellar. Then choose Shilling (KES) as the money you receive, and tap Done.",
    image: { src: "/guide/step-4-choose.jpg", alt: "Choosing USDC on Stellar and KES" },
  },
  {
    title: "Enter the amount and your bank details",
    body: "Type how much USDC you want to sell. Then choose where you want to be paid, your bank or M-Pesa, and enter your account or M-Pesa number.",
    image: { src: "/guide/step-5-details.jpg", alt: "Entering the amount and payout details" },
  },
  {
    title: "Connect your wallet",
    body: "Tap Connect Stellar, choose Varial from the list, and approve the connection in the wallet.",
    image: { src: "/guide/step-6-connect.jpg", alt: "Connecting a Stellar wallet" },
  },
  {
    title: "Check the quote and confirm",
    body: "The quote shows how many shillings you will receive. If it looks right, confirm.",
  },
  {
    title: "Approve in your wallet",
    body: "Varial asks you to approve the transfer of your USDC. Check the amount and approve.",
  },
  {
    title: "Wait for your money",
    body: "After a few minutes the shillings are paid to your bank account or M-Pesa. To check on your order, open History in AutoRamp.",
  },
];

const statuses: [string, string][] = [
  ["Expired", "The USDC did not arrive in time, so the order was cancelled and nothing was paid out."],
  [
    "Partially settled",
    "Less USDC arrived than the order needed. The order shows how much was expected, received and still missing.",
  ],
  ["Payout rejected", "Your USDC arrived, but the bank payout was declined. The reason is shown on the order."],
  ["Reversed", "The payout was sent and later sent back. It is linked to your original order."],
  ["Payout held", "AutoRamp could not pay out straight away and will try again."],
];

export default function CashOutGuidePage() {
  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      <Header />
      <main className="flex-1 px-6 pt-32 pb-16">
        <article className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-widest text-secondary mb-3">USER GUIDE</p>
          <h1 className="text-4xl font-bold mb-2">Cash out USDC to KES</h1>
          <p className="text-sm text-white/40 mb-10">Last updated: {LAST_UPDATED}</p>
          <p className="text-white/70 mb-10 leading-relaxed">
            AutoRamp lets you turn digital dollars (USDC) into Kenyan shillings (KES) paid to your bank account or
            M-Pesa. One USDC is worth about one US dollar. This guide walks you through it step by step, and you do
            not need to know anything about crypto.
          </p>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">What you need</h2>
            <ul className="list-disc pl-5 space-y-2 text-white/70 leading-relaxed">
              <li>
                Some USDC. It is kept in a wallet, which is an app that holds your digital money. The wallet also
                needs a small amount of XLM, Stellar&apos;s own coin.
              </li>
              <li>
                The Varial wallet app (it used to be called Freighter). It is free. Get Varial on Google Play.
              </li>
              <li>A Kenyan bank account or M-Pesa number to receive the shillings. Have the details ready.</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">Steps</h2>
            <ol className="space-y-8">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex-none h-8 w-8 rounded-full bg-secondary text-black text-sm font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold mb-1">{s.title}</h3>
                    <p className="text-white/70 leading-relaxed">{s.body}</p>
                    {s.image && (
                      <Image
                        src={s.image.src}
                        alt={s.image.alt}
                        width={916}
                        height={612}
                        className="mt-4 rounded-lg border border-white/10 w-full max-w-xl h-auto"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">If something looks wrong</h2>
            <p className="text-white/70 mb-4 leading-relaxed">
              AutoRamp saves every cash-out, so you can check on it later, even after closing the page. These are the
              unusual results and what each one means:
            </p>
            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="text-left p-4 w-40">What you see</th>
                    <th className="text-left p-4">What it means</th>
                  </tr>
                </thead>
                <tbody className="text-white/70">
                  {statuses.map(([name, meaning]) => (
                    <tr key={name} className="border-b border-white/5 last:border-0 align-top">
                      <td className="p-4 font-medium text-white">{name}</td>
                      <td className="p-4">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Common fixes</h2>
            <ul className="list-disc pl-5 space-y-2 text-white/70 leading-relaxed">
              <li>
                The wallet button asks you to install a wallet you already have. Open AutoRamp on the same phone that
                has Varial, then reload the page.
              </li>
              <li>The payout does not arrive. Check that your bank or M-Pesa details are right.</li>
              <li>
                You need help with an order. Keep the transaction ID from History, because it identifies your payment.
              </li>
            </ul>
            <p className="text-white/70 mt-4">
              Still stuck? Email{" "}
              <Link href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">
                {CONTACT_EMAIL}
              </Link>
              .
            </p>
          </section>
        </article>
      </main>
      <Footer />
    </div>
  );
}
