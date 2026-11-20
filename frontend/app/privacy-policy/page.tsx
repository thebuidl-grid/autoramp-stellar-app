import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import Footer from "@/components/layout/footer";

export const metadata: Metadata = {
  title: "Privacy Policy | AutoRamp",
  description: "How AutoRamp collects, uses and protects your information.",
};

const LAST_UPDATED = "November 15, 2026";
const CONTACT_EMAIL = "dev@thebuidlgrid.org";

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Information we collect",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Account information:</strong> email address and authentication details when you sign up or log in.</li>
        <li><strong>Verification (KYC/KYB) information:</strong> identity and business details you submit so we can meet our compliance obligations.</li>
        <li><strong>Payment information:</strong> bank account details and wallet addresses you provide to send or receive funds, plus transaction records.</li>
        <li><strong>Technical information:</strong> device, browser, IP address and usage data collected automatically to keep the service secure and working.</li>
      </ul>
    ),
  },
  {
    title: "2. How we use your information",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li>To provide onramp, offramp and OTC services and process your transactions.</li>
        <li>To verify your identity and comply with anti-money-laundering and sanctions laws.</li>
        <li>To detect, prevent and investigate fraud and abuse.</li>
        <li>To provide support and send service-related notices.</li>
        <li>To improve and secure our products.</li>
      </ul>
    ),
  },
  {
    title: "3. Sharing your information",
    body: (
      <p>
        We do not sell your personal information. We share it only with service providers that help us operate AutoRamp
        (such as payment, banking, identity-verification and infrastructure partners), with regulators or law enforcement
        when legally required, and in connection with a business transfer. Blockchain transactions are public by nature
        and cannot be erased.
      </p>
    ),
  },
  {
    title: "4. Data retention",
    body: (
      <p>
        We keep your information for as long as your account is active and for as long as needed to meet legal,
        accounting and regulatory record-keeping requirements, after which it is deleted or anonymised.
      </p>
    ),
  },
  {
    title: "5. Security",
    body: (
      <p>
        We use technical and organisational safeguards to protect your information. No system is completely secure, so
        we cannot guarantee absolute security.
      </p>
    ),
  },
  {
    title: "6. Your rights",
    body: (
      <p>
        Depending on where you live, you may have the right to access, correct, delete or export your personal
        information, or to object to certain processing. Some information must be retained to meet legal obligations.
        To make a request, contact us at the address below.
      </p>
    ),
  },
  {
    title: "7. Cookies",
    body: (
      <p>
        We use cookies and similar technologies that are necessary to keep you signed in and to understand how the
        service is used. You can control cookies through your browser settings, but parts of the service may not work
        without them.
      </p>
    ),
  },
  {
    title: "8. Children",
    body: <p>AutoRamp is not intended for anyone under 18, and we do not knowingly collect their information.</p>,
  },
  {
    title: "9. Changes to this policy",
    body: (
      <p>
        We may update this policy from time to time. The &ldquo;Last updated&rdquo; date above shows when it was last
        revised. Continued use of AutoRamp after changes means you accept the updated policy.
      </p>
    ),
  },
  {
    title: "10. Contact us",
    body: (
      <p>
        Questions or requests? Email{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">
          {CONTACT_EMAIL}
        </Link>
        .
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      <Header />
      <main className="flex-1 px-6 pt-32 pb-16">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-white/40 mb-10">Last updated: {LAST_UPDATED}</p>
          <p className="text-white/70 mb-10">
            This policy explains what information AutoRamp (operated by The Buidl Grid) collects, how we use it, and the
            choices you have.
          </p>
          <div className="space-y-8">
            {sections.map((s) => (
              <section key={s.title}>
                <h2 className="text-xl font-semibold mb-3">{s.title}</h2>
                <div className="text-white/70 leading-relaxed">{s.body}</div>
              </section>
            ))}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
