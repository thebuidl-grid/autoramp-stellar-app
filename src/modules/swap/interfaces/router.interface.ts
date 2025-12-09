import { ethers } from 'ethers';
import { Route } from '../types/swap.types'; 

export interface RouterInterface {
  swapExactTokensForTokens(
    amountIn: bigint,
    amountOutMin: bigint,
    routes: Route[],
    to: string,
    deadline: bigint,
  ): Promise<ethers.TransactionResponse>;
  getAmountsOut(amountIn: bigint, routes: Route[]): Promise<any>;
}
