import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { IS_TESTNET } from "@/lib/constants/networks";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sellToken = searchParams.get("sellToken");
  const buyToken = searchParams.get("buyToken");
  const sellAmount = searchParams.get("sellAmount");
  const taker = searchParams.get("takerAddress") || searchParams.get("taker");
  const slippagePercentage = searchParams.get("slippagePercentage") || "0.05";

  if (!sellToken || !buyToken || !sellAmount) {
    return NextResponse.json(
      {
        error: "Missing required parameters (sellToken, buyToken, sellAmount)",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.ZEROEX_API_KEY;
  if (!apiKey) {
    console.error("ZEROEX_API_KEY is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const queryChainId = searchParams.get("chainId");
  const chainId = queryChainId
    ? parseInt(queryChainId)
    : IS_TESTNET
      ? 84532
      : 8453;

  const isQuote = !!taker;
  const endpoint = isQuote
    ? "https://api.0x.org/swap/permit2/quote"
    : "https://api.0x.org/swap/permit2/price";

  try {
    const params: any = {
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      slippagePercentage,
    };

    if (taker) {
      params.taker = taker;
    }

    const response = await axios.get(endpoint, {
      params,
      headers: {
        "0x-api-key": apiKey,
        "0x-version": "v2",
      },
    });
    return NextResponse.json(response.data);
  } catch (error: any) {
    if (error.response?.data) {
      console.error(
        "0x API Proxy Error Details:",
        JSON.stringify(error.response.data, null, 2),
      );
    } else {
      console.error("0x API Proxy Error:", error.message);
    }
    const status = error.response?.status || 500;
    const data = error.response?.data || {
      error: "Failed to fetch quote from 0x",
    };
    return NextResponse.json(data, { status });
  }
}
