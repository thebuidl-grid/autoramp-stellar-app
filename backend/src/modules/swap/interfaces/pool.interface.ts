import { AddressLike } from 'ethers';

export interface PoolInterface {
  factory(): Promise<AddressLike | string>;
  token0(): Promise<AddressLike | string>;
  token1(): Promise<AddressLike | string>;
  tickSpacing(): Promise<bigint>;
  liquidity(): Promise<bigint>;
  slot0(): Promise<any>;
  fee(): Promise<any>;
}
