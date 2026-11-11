export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  recipient: string;
  slippageTolerance?: number;
  deadline?: number;
  fee?: number;
}
