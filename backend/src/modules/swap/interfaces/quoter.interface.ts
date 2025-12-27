import { AddressLike } from 'ethers';

export interface QuoterInterface {
  quoteExactInputSingle(params: {
    tokenIn: AddressLike | string;
    tokenOut: AddressLike | string;
    amountIn: bigint;
    tickSpacing: number | bigint;
    sqrtPriceLimitX96: bigint;
  }): Promise<{
    amountOut: bigint;
    sqrtPriceX96After: bigint;
    initializedTicksCrossed: number;
    gasEstimate: bigint;
  }>;
}
