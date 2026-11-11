import { ethers, AddressLike } from 'ethers';

export interface ERC20Interface {
  decimals(): Promise<number>;
  balanceOf(address: AddressLike): Promise<bigint>;
  allowance(owner: AddressLike, spender: AddressLike): Promise<bigint>;
  approve(
    spender: AddressLike,
    amount: bigint,
  ): Promise<ethers.TransactionResponse>;
}
