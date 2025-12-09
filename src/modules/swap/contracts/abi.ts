export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

export const AERODROME_ROUTER_ABI = [
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, tuple(address from,address to,bool stable,address factory)[] routes, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function getAmountsOut(uint256 amountIn, tuple(address from,address to,bool stable,address factory)[] routes) external view returns (uint256[] memory amounts)',
  'function factory() external view returns (address)',
  'function WETH() external view returns (address)',
];

export const AERODROME_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96) params) external view returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
];

export const AERODROME_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, bool stable) external view returns (address)',
];

export const AERODROME_POOL_ABI = [
  'function factory() external view returns (address)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function tickSpacing() external view returns (int24)',
  'function liquidity() external view returns (uint128)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)',
  'function fee() external view returns (uint128)',
];

export const AERODROME_VALID_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function stable() external view returns (bool)',
  'function getReserves() external view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)',
  'function totalSupply() external view returns (uint256)',
  'function poolFees() external view returns (address)',
  'function prices(address tokenIn, uint256 amountIn, uint256 points) external view returns (uint256[] memory)',
];
