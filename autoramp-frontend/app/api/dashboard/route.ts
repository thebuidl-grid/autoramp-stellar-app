import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

/**
 * Fetch the current USD/NGN rate from a public exchange-rate API.
 * Returns null when the service is unavailable.
 */
async function fetchUsdNgnRate(): Promise<number | null> {
  try {
    const { data } = await axios.get<{ rates?: Record<string, number> }>(
      "https://api.exchangerate-api.com/v4/latest/USD",
      { timeout: 10000 },
    );
    const ngnRate = data.rates?.NGN;
    if (typeof ngnRate === "number" && ngnRate > 0) {
      return ngnRate;
    }
    return null;
  } catch (error) {
    console.error("[Dashboard Proxy] Could not fetch USD/NGN rate:", error);
    return null;
  }
}

/**
 * Convert a NGN total_tip value to USD using the provided rate.
 * Rate is expected to represent 1 USD = rate NGN.
 */
function convertNgnToUsd(ngnAmount: number, rate: number | null): number {
  if (!rate || rate <= 0 || ngnAmount <= 0) return 0;
  return ngnAmount / rate;
}

/**
 * AutoRamp Dashboard proxy — GET /api/dashboard
 *
 * Forwards to backend GET /data with the x-admin-email header.
 * Same-origin, so the browser never hits backend CORS.
 * Backend status codes (including 401) are passed through untouched.
 *
 * Enriches the response with a USD conversion of total_tip by fetching the
 * current USD/NGN rate from the backend rate service.
 */
export async function GET(request: NextRequest) {
  const adminEmail = request.headers.get("x-admin-email")?.trim();

  if (!adminEmail) {
    return NextResponse.json(
      { statusCode: 401, message: "Missing x-admin-email header" },
      { status: 401 },
    );
  }

  const targetUrl = `${BACKEND_URL}/data`;

  try {
    const [dataResponse, usdNgnRate] = await Promise.all([
      axios.get(targetUrl, {
        headers: { "x-admin-email": adminEmail },
        timeout: 15000,
      }),
      fetchUsdNgnRate(),
    ]);

    const data = dataResponse.data;
    const totalTipNgn =
      typeof data.totalTip === "number"
        ? data.totalTip
        : typeof data.total_tip === "number"
          ? data.total_tip
          : 0;
    const totalTipUsd = convertNgnToUsd(totalTipNgn, usdNgnRate);

    return NextResponse.json(
      {
        ...data,
        totalTip: totalTipNgn,
        totalTipUsd,
        usdNgnRate,
      },
      { status: dataResponse.status },
    );
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, {
        status: error.response.status,
      });
    }
    console.error("[Data Proxy] Error:", error);
    return NextResponse.json(
      { statusCode: 502, message: "Could not reach backend GET /dashboard" },
      { status: 502 },
    );
  }
}
