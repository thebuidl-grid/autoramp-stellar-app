export interface FactoryInterface {
  getPool(
    tokenA: string,
    tokenB: string,
    stableOrFee: boolean | number,
  ): Promise<string>;
}
