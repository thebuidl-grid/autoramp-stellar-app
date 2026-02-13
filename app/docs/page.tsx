"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { HeroBackground } from "@/components/hero/hero-background";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.autoramp.com";

function RequestAPIAccessButton() {
    const router = useRouter();
    const { user } = useAuthStore();

    const handleClick = () => {
        // If user is already a merchant, go to dashboard
        // Otherwise, go to KYB page to complete merchant onboarding
        if (user?.isMerchant) {
            router.push("/merchant/dashboard");
        } else {
            router.push("/merchant/onboarding");
        }
    };

    return (
        <button
            onClick={handleClick}
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-black text-sm font-medium rounded-lg hover:bg-secondary/90 transition-colors"
        >

            {user?.isMerchant ? "Go to Merchant Dashboard" : "Request API Key"}
        </button>
    );
}

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group">
            <pre className="bg-black/80 border border-white/10 rounded-lg p-4 overflow-x-auto text-sm">
                <code className="text-green-400">{code}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 rounded-md bg-white/10 hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-white/60" />}
            </button>
        </div>
    );
}

function EndpointSection({
    method,
    endpoint,
    title,
    description,
    auth,
    requestBody,
    responseExample,
    queryParams,
}: {
    method: "GET" | "POST";
    endpoint: string;
    title: string;
    description: string;
    auth: boolean;
    requestBody?: string;
    responseExample: string;
    queryParams?: { name: string; type: string; required: boolean; description: string }[];
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border border-white/10 rounded-lg overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left"
            >
                <span className={cn(
                    "px-2 py-1 rounded text-xs font-bold",
                    method === "GET" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"
                )}>
                    {method}
                </span>
                <code className="text-white/80 font-mono text-sm">{endpoint}</code>
                <span className="text-white/60 text-sm flex-1">{title}</span>
                {auth && <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Auth Required</span>}
                {isOpen ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
            </button>

            {isOpen && (
                <div className="p-4 border-t border-white/10 space-y-4 bg-white/[0.02]">
                    <p className="text-white/70 text-sm">{description}</p>

                    {queryParams && queryParams.length > 0 && (
                        <div>
                            <h4 className="text-white font-medium text-sm mb-2">Query Parameters</h4>
                            <div className="space-y-2">
                                {queryParams.map((param) => (
                                    <div key={param.name} className="flex items-start gap-2 text-sm">
                                        <code className="text-purple-400">{param.name}</code>
                                        <span className="text-white/40">({param.type})</span>
                                        {param.required && <span className="text-red-400 text-xs">required</span>}
                                        <span className="text-white/60">- {param.description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {requestBody && (
                        <div>
                            <h4 className="text-white font-medium text-sm mb-2">Request Body</h4>
                            <CodeBlock code={requestBody} />
                        </div>
                    )}

                    <div>
                        <h4 className="text-white font-medium text-sm mb-2">Response</h4>
                        <CodeBlock code={responseExample} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DocsPage() {
    const { user } = useAuthStore();
    const router = useRouter();

    const handleRequestAccess = (e: React.MouseEvent) => {
        if (user?.isMerchant) {
            e.preventDefault();
            if (user.isMerchant) {
                router.push("/merchant/dashboard");
            } else {
                router.push("/merchant/onboarding");
            }
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden">
            <HeroBackground />
            <Header />

            <main className="max-w-4xl mx-auto px-4 py-12 my-[10em]">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl font-bold text-white mb-4">API Documentation</h1>
                    <p className="text-white/60 text-lg">
                        Integrate AutoRamp into your application with our simple REST API.
                    </p>
                </div>

                {/* Quick Start */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold text-white mb-4">Quick Start</h2>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-4">
                        <div>
                            <h3 className="text-white font-medium mb-2">1. Request API Access</h3>
                            <p className="text-white/60 text-sm mb-3">
                                Complete the merchant KYB process to request API access.
                            </p>
                            <RequestAPIAccessButton />
                        </div>
                        <div>
                            <h3 className="text-white font-medium mb-2">2. Get your API Key</h3>
                            <p className="text-white/60 text-sm">
                                Once approved, log in to your <a href="/merchant/dashboard" className="text-blue-400 hover:underline">Merchant Dashboard</a> and create an API key.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-white font-medium mb-2">3. Make your first request</h3>
                            <CodeBlock
                                language="bash"
                                code={`curl -X GET "${API_BASE_URL}/api/merchant/banks" \\
  -H "x-api-key: sk_live_your_api_key_here"`}
                            />
                        </div>
                    </div>
                </section>

                {/* Authentication */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold text-white mb-4">Authentication</h2>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                        <p className="text-white/70 mb-4">
                            All endpoints require an API key. Include your API key in the request header:
                        </p>
                        <CodeBlock code={`x-api-key: sk_live_your_api_key_here`} />
                        <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-yellow-400 text-sm">
                                <strong>Important:</strong> Keep your API key secret. Never expose it in client-side code or public repositories.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Base URL */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold text-white mb-4">Base URL</h2>
                    <CodeBlock code={API_BASE_URL} />
                </section>

                {/* Endpoints */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold text-white mb-6">Endpoints</h2>

                    <div className="space-y-4">
                        {/* Banks */}
                        <EndpointSection
                            method="GET"
                            endpoint="/misc/banks"
                            title="List Banks"
                            description="Get a list of all supported Nigerian banks. Use the bank code when creating offramp transactions."
                            auth={true}
                            responseExample={`{
  "success": true,
  "data": [
    {
      "code": "044",
      "name": "Access Bank"
    },
    {
      "code": "058",
      "name": "GTBank"
    }
  ]
}`}
                        />

                        {/* Resolve Account */}
                        <EndpointSection
                            method="GET"
                            endpoint="/misc/resolve-account"
                            title="Resolve Account"
                            description="Verify a bank account and get the account holder's name before processing a transaction."
                            auth={true}
                            queryParams={[
                                { name: "bankCode", type: "string", required: true, description: "Bank code from /banks endpoint" },
                                { name: "accountNumber", type: "string", required: true, description: "10-digit account number" },
                            ]}
                            responseExample={`{
  "success": true,
  "data": {
    "accountName": "JOHN DOE",
    "accountNumber": "0123456789",
    "bankCode": "044"
  }
}`}
                        />

                        {/* Onramp */}
                        <EndpointSection
                            method="POST"
                            endpoint="/api/merchant/onramp"
                            title="Create Onramp (Buy Crypto)"
                            description="Convert NGN to CNGN. The user pays NGN to a virtual account and receives CNGN at the specified wallet address."
                            auth={true}
                            requestBody={`{
  "network": "base",
  "amount": 10000,
  "destination": {
    "address": "0x1234567890abcdef..."
  },
  "notifyUrl": "https://your-webhook.com/callback"
}`}
                            responseExample={`{
  "success": true,
  "data": {
    "reference": "TXN_123456789",
    "status": "PENDING",
    "amount": 10000,
    "tokenAmount": "10000.00",
    "depositAccount": {
      "bankName": "Providus Bank",
      "accountNumber": "1234567890",
      "accountName": "AutoRamp"
    }
  }
}`}
                        />

                        {/* Offramp */}
                        <EndpointSection
                            method="POST"
                            endpoint="/api/merchant/offramp"
                            title="Create Offramp (Sell Crypto)"
                            description="Convert CNGN to NGN. Send CNGN to the deposit address and receive NGN in the specified bank account."
                            auth={true}
                            requestBody={`{
  "network": "base",
  "amount": 10000,
  "destination": {
    "bankCode": "044",
    "accountNumber": "0123456789"
  },
  "notifyUrl": "https://your-webhook.com/callback"
}`}
                            responseExample={`{
  "success": true,
  "data": {
    "reference": "TXN_987654321",
    "status": "PENDING",
    "amount": 10000,
    "fiatAmount": "10000.00",
    "depositAddress": "0xabcdef1234567890..."
  }
}`}
                        />

                        {/* Transactions */}
                        <EndpointSection
                            method="GET"
                            endpoint="/api/merchant/transactions"
                            title="List Transactions"
                            description="Get a paginated list of your transactions. Filter by ID or reference."
                            auth={true}
                            queryParams={[
                                { name: "id", type: "string", required: false, description: "Filter by transaction ID" },
                                { name: "reference", type: "string", required: false, description: "Filter by transaction reference" },
                                { name: "page", type: "number", required: false, description: "Page number (default: 1)" },
                                { name: "limit", type: "number", required: false, description: "Items per page (default: 10)" },
                            ]}
                            responseExample={`{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "reference": "TXN_123456789",
        "type": "onramp",
        "status": "COMPLETED",
        "amount": 10000,
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50
    }
  }
}`}
                        />
                    </div>
                </section>

                {/* Webhooks */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold text-white mb-4">Webhooks</h2>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-6">
                        <p className="text-white/70">
                            Configure a <code className="text-purple-400">webhookUrl</code> in your dashboard settings to receive real-time notifications when a transaction status changes.
                        </p>

                        <div>
                            <h3 className="text-white font-medium mb-3">Event Types</h3>
                            <div className="bg-black/40 rounded-lg overflow-hidden border border-white/5">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-white/10 bg-white/5">
                                        <tr>
                                            <th className="text-left p-3 text-white">Event Name</th>
                                            <th className="text-left p-3 text-white">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-white/60">
                                        <tr className="border-b border-white/5">
                                            <td className="p-3 font-mono text-purple-400">onramp.updated</td>
                                            <td className="p-3">Sent when an onramp transaction status changes.</td>
                                        </tr>
                                        <tr className="border-b border-white/5">
                                            <td className="p-3 font-mono text-purple-400">offramp.updated</td>
                                            <td className="p-3">Sent when an offramp transaction status changes.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-mono text-purple-400">swap.updated</td>
                                            <td className="p-3">Sent when a swap transaction status changes.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-white font-medium mb-3">Webhook Payload</h3>
                            <p className="text-white/60 text-sm mb-3">
                                Our server sends a POST request with the following JSON structure:
                            </p>
                            <CodeBlock code={`{
  "event": "transaction.type.updated",
  "timestamp": "2024-02-04T12:34:56.789Z",
  "data": {
    "id": "transaction-uuid",
    "reference": "TRX-123456",
    "status": "COMPLETED",
    "amount": 5000.00,
    "currency": "NGN",
    "tokenAmount": 4950.00,
    "tokenType": "CNGN",
    "network": "base"
  }
}`} />
                        </div>

                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <h4 className="text-blue-400 text-sm font-bold mb-2">Transaction Statuses</h4>
                            <div className="flex flex-wrap gap-2">
                                {["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"].map(status => (
                                    <span key={status} className="px-2 py-1 bg-white/10 rounded text-xs text-white/80 font-mono">
                                        {status}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-yellow-400 text-sm">
                                <strong>Note:</strong> Currently, webhooks are sent as plain JSON. We recommend verifying the source of the request. Request signing will be implemented in a future update.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Error Codes */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold text-white mb-4">Error Codes</h2>
                    <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="border-b border-white/10">
                                <tr>
                                    <th className="text-left p-4 text-white">Code</th>
                                    <th className="text-left p-4 text-white">Description</th>
                                </tr>
                            </thead>
                            <tbody className="text-white/70">
                                <tr className="border-b border-white/5">
                                    <td className="p-4"><code className="text-red-400">400</code></td>
                                    <td className="p-4">Bad Request - Invalid parameters</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="p-4"><code className="text-red-400">401</code></td>
                                    <td className="p-4">Unauthorized - Invalid or missing API key</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="p-4"><code className="text-red-400">403</code></td>
                                    <td className="p-4">Forbidden - API access not approved</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="p-4"><code className="text-red-400">404</code></td>
                                    <td className="p-4">Not Found - Resource doesn't exist</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="p-4"><code className="text-red-400">429</code></td>
                                    <td className="p-4">Rate Limited - Too many requests</td>
                                </tr>
                                <tr>
                                    <td className="p-4"><code className="text-red-400">500</code></td>
                                    <td className="p-4">Server Error - Please try again later</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Support */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold text-white mb-4">Need Help?</h2>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                        <p className="text-white/70">
                            If you have any questions or need assistance, please contact our support team at{" "}
                            <a href="mailto:dev@thebuidlgrid.org" className="text-blue-400 hover:underline">
                                dev@thebuidlgrid.org
                            </a>
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}
