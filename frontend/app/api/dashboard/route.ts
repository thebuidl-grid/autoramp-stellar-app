import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { backendBaseUrl } from "@/lib/server/backend-url";


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
 * Forwards to backend GET /data with the admin's bearer token.
 * Same-origin, so the browser never hits backend CORS.
 * Backend status codes (including 401) are passed through untouched.
 *
 * Enriches the response with a USD conversion of total_tip by fetching the
 * current USD/NGN rate from the backend rate service.
 */
export async function GET(request: NextRequest) {
  // The backend authorizes this with the admin's own JWT (role ADMIN). An email typed into a
  // header proves nothing: anyone can send any email.
  const authorization = request.headers.get("authorization");

  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return NextResponse.json(
      { statusCode: 401, message: "Admin login required" },
      { status: 401 },
    );
  }

  const targetUrl = `${backendBaseUrl() || "http://localhost:3003"}/data`;

  try {
    const [dataResponse, usdNgnRate] = await Promise.all([
      axios.get(targetUrl, {
        headers: { Authorization: authorization },
        timeout: 15000,
        maxRedirects: 0,
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
      const status = error.response.status;
      // Pass auth failures through; never relay arbitrary upstream bodies or internals.
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { statusCode: status, message: status === 401 ? "Admin login required" : "Admin access required" },
          { status },
        );
      }
      return NextResponse.json({ statusCode: 502, message: "Dashboard data is unavailable" }, { status: 502 });
    }
    console.error("[Data Proxy] Error:", error);
    return NextResponse.json(
      { statusCode: 502, message: "Could not reach backend GET /dashboard" },
      { status: 502 },
    );
  }
}
