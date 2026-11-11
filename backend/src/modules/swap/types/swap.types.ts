export interface Route {
  from: string;
  to: string;
  stable: boolean;
  factory: string;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}
