import { Route } from "../types/swap.types";

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  amountOutMin: bigint;
  route?: Route[];
  priceImpact?: string;
  tickSpacing?: number | bigint;
  sqrtPriceX96After?: bigint;
  gasEstimate?: bigint;
}
