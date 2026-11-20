
"use client";
/**
 * Shows which NEXT_PUBLIC_* values this build was compiled with. They are baked in at build time and already public
 * in the browser bundle, so nothing secret is shown. Each variable must be written out as `process.env.NEXT_PUBLIC_X`
 * for Next to inline it, so no dynamic lookups here. Remove this page once the deployment is verified.
 */
import { WALLETCONNECT_PROJECT_ID } from "@/lib/constants/walletconnect";

const VARS: Array<[string, string | undefined]> = [
  ["NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL],
  ["NEXT_PUBLIC_WS_URL", process.env.NEXT_PUBLIC_WS_URL],
  ["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", WALLETCONNECT_PROJECT_ID],
  ["NEXT_PUBLIC_NETWORK", process.env.NEXT_PUBLIC_NETWORK],
  ["NEXT_PUBLIC_RPC_MAINNET", process.env.NEXT_PUBLIC_RPC_MAINNET],
  ["NEXT_PUBLIC_RPC_BASE", process.env.NEXT_PUBLIC_RPC_BASE],
  ["NEXT_PUBLIC_RPC_BASE_SEPOLIA", process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA],
  ["NEXT_PUBLIC_RPC_POLYGON", process.env.NEXT_PUBLIC_RPC_POLYGON],
  ["NEXT_PUBLIC_SWAP_ROUTER_ADDRESS", process.env.NEXT_PUBLIC_SWAP_ROUTER_ADDRESS],
  ["NEXT_PUBLIC_STELLAR_USDC_ISSUER", process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER],
];

export default function EnvDebugPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-semibold">Build environment</h1>
      <p className="mb-6 text-sm opacity-70">Values compiled into this deployment.</p>
      <table className="w-full text-left text-sm">
        <tbody>
          {VARS.map(([name, value]) => (
            <tr key={name} className="border-b border-white/10 align-top">
              <td className="py-2 pr-4 font-mono text-xs">{name}</td>
              <td className={`py-2 font-mono text-xs break-all ${value ? "" : "text-red-400"}`}>{value || "(not set)"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
