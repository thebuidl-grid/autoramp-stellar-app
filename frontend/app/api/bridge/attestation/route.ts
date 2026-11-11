import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for Circle's Iris attestation API (browser CORS-safe).
 * GET /api/bridge/attestation?domain=27&tx=<burnTxHash>&network=testnet
 * -> { status: "pending" | "pending_confirmations" | "complete", message?, attestation? }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const domain = p.get("domain") ?? "";
  const tx = p.get("tx") ?? "";
  const network = p.get("network");

  if (!/^\d{1,3}$/.test(domain)) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(tx)) {
    return NextResponse.json({ error: "Invalid tx hash" }, { status: 400 });
  }
  if (network !== "testnet" && network !== "mainnet") {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }

  const iris =
    network === "testnet"
      ? "https://iris-api-sandbox.circle.com"
      : "https://iris-api.circle.com";
  try {
    const r = await fetch(`${iris}/v2/messages/${domain}?transactionHash=${tx}`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ status: "pending" });
    const m = (await r.json())?.messages?.[0];
    if (m?.status === "complete" && m.message && m.attestation) {
      return NextResponse.json({
        status: "complete",
        message: m.message,
        attestation: m.attestation,
      });
    }
    return NextResponse.json({ status: m?.status ?? "pending" });
  } catch {
    return NextResponse.json({ status: "pending" });
  }
}
