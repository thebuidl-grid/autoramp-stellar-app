import { ethers } from 'ethers';
import { ADDRESSES, TOKENS } from '../config/constant';
import {
  AERODROME_FACTORY_ABI,
  AERODROME_POOL_ABI,
  AERODROME_QUOTER_ABI,
  AERODROME_ROUTER_ABI,
  ERC20_ABI,
} from '../contracts/abi';
import {
  ERC20Interface,
  FactoryInterface,
  PoolInterface,
  QuoterInterface,
  RouterInterface,
} from '../interfaces';
import { TokenInfo } from '../types/swap.types';
import { SwapParams } from '../dto/swap-params.dto';
import { SwapQuote } from '../dto/swap-quote.dto';

export class Swapper {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private router: ethers.Contract & RouterInterface;
  private quoter: ethers.Contract & QuoterInterface;
  private factory: ethers.Contract & FactoryInterface;
  private pool: ethers.Contract & PoolInterface;
  private usdc: ethers.Contract & ERC20Interface;
  private cngn: ethers.Contract & ERC20Interface;

  constructor(provider: ethers.Provider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
    this.router = new ethers.Contract(
      ADDRESSES.AERODROME.ROUTER,
      AERODROME_ROUTER_ABI,
      signer,
    ) as ethers.Contract & RouterInterface;
    this.quoter = new ethers.Contract(
      ADDRESSES.AERODROME.QUOTER,
      AERODROME_QUOTER_ABI,
      signer, // Use signer for quoter if needed; provider for read-only
    ) as ethers.Contract & QuoterInterface;
    this.factory = new ethers.Contract(
      ADDRESSES.AERODROME.FACTORY,
      AERODROME_FACTORY_ABI,
      provider,
    ) as ethers.Contract & FactoryInterface;
    this.pool = new ethers.Contract(
      ADDRESSES.AERODROME.POOL,
      AERODROME_POOL_ABI,
      this.provider,
    ) as ethers.Contract & PoolInterface;
    this.usdc = new ethers.Contract(
      ADDRESSES.USDC,
      ERC20_ABI,
      this.provider,
    ) as ethers.Contract & ERC20Interface; // Provider for read-only in backend
    this.cngn = new ethers.Contract(
      ADDRESSES.CNGN,
      ERC20_ABI,
      this.provider,
    ) as ethers.Contract & ERC20Interface;
  }

  /**
   * Swap USDC to CNGN
   */
  async swapUSDCtoCNGN(
    params: Omit<SwapParams, 'tokenIn' | 'tokenOut'>,
  ): Promise<ethers.TransactionResponse> {
    return this.swap({
      ...params,
      tokenIn: ADDRESSES.USDC,
      tokenOut: ADDRESSES.CNGN,
    });
  }

  /**
   * Swap CNGN to USDC
   */
  async swapCNGNtoUSDC(
    params: Omit<SwapParams, 'tokenIn' | 'tokenOut'>,
  ): Promise<ethers.TransactionResponse> {
    return this.swap({
      ...params,
      tokenIn: ADDRESSES.CNGN,
      tokenOut: ADDRESSES.USDC,
    });
  }

  /**
   * Generic swap function
   */
  async swap(params: SwapParams): Promise<ethers.TransactionResponse> {
    // Typed return
    const {
      tokenIn,
      tokenOut,
      amountIn,
      deadline = Math.floor(Date.now() / 1000) + 1200,
    } = params;

    const slippageTolerance = params.slippageTolerance ?? 0.05;

    const recipient = params.recipient
      ? params.recipient
      : await this.signer.getAddress();

    const tokenInInfo =
      tokenIn === TOKENS.USDC?.address ? TOKENS.USDC : TOKENS.CNGN;
    const tokenInDecimals = tokenInInfo?.decimals ?? 6;

    const tokenOutInfo =
      tokenOut === TOKENS.USDC?.address ? TOKENS.USDC : TOKENS.CNGN;
    const tokenOutDecimals = tokenOutInfo?.decimals ?? 18;

    const amountInWei = ethers.parseUnits(amountIn, tokenInDecimals);

    await this.ensureAllowance(tokenIn, amountInWei);

    const routes = [
      {
        from: tokenIn,
        to: tokenOut,
        stable: false,
        factory: ADDRESSES.AERODROME.FACTORY,
      },
    ];

    const amountsOut = await this.router.getAmountsOut(amountInWei, routes);
    const expectedOut = amountsOut[1];

    const slippageMultiplier = BigInt(
      Math.floor((1 - slippageTolerance) * 1e6),
    );
    const amountOutMin = (expectedOut * slippageMultiplier) / BigInt(1e6);

    console.log(
      'Expected Out (formatted):',
      ethers.formatUnits(expectedOut, tokenOutDecimals),
    ); // Replace with logger in prod

    console.log(
      'Minimum Out with slippage (formatted):',
      ethers.formatUnits(amountOutMin, tokenOutDecimals),
    );

    const tx = await this.router.swapExactTokensForTokens(
      amountInWei,
      amountOutMin,
      routes,
      recipient,
      BigInt(deadline),
    );

    console.log('Swap tx hash:', tx.hash);

    return tx;
  }

  /**
   * Get a quote for a swap
   */
  async getQuote(params: SwapParams): Promise<SwapQuote> {
    const slippageBps = params.slippageTolerance ?? 50;
    const amountIn = ethers.parseUnits(
      params.amountIn,
      params.tokenIn === TOKENS.USDC?.address
        ? TOKENS.USDC?.decimals
        : TOKENS.CNGN?.decimals,
    );
    const tickSpacing = await this.pool.tickSpacing();

    try {
      const result = await this.quoter.quoteExactInputSingle({
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn,
        tickSpacing,
        sqrtPriceLimitX96: 0n,
      });

      const { amountOut, sqrtPriceX96After, gasEstimate } = result;

      const amountOutMin =
        (amountOut * BigInt(10000 - slippageBps)) / BigInt(10000);

      return {
        amountIn,
        amountOut,
        amountOutMin,
        tickSpacing,
        sqrtPriceX96After,
        gasEstimate,
      };
    } catch (error: any) {
      throw new Error(
        `Failed to get quote. Check your quoter ABI & arguments: ${error.message}`,
      );
    }
  }

  /** Get pool info */
  async getPoolInfo() {
    const [token0, token1, tickSpacing, liquidity, slot0] = await Promise.all([
      this.pool.token0(),
      this.pool.token1(),
      this.pool.tickSpacing(),
      this.pool.liquidity(),
      this.pool.slot0(),
    ]);
    return {
      token0,
      token1,
      tickSpacing: Number(tickSpacing),
      liquidity: Number(liquidity),
      sqrtPriceX96: Number(slot0[0]),
      tick: Number(slot0[1]),
    };
  }

  /**
   * Get token balance
   */
  async getTokenBalance(
    _token: string,
    address?: string,
  ): Promise<string | null> {
    let targetAddress: string;
    if (address) {
      targetAddress = address;
    } else {
      if (!this.signer) {
        throw new Error('No address or signer provided for balance query');
      }
      targetAddress = await this.signer.getAddress();
    }

    let balance: bigint | null = null;
    let decimals: number | null = null;
    const tokenUpper = _token.toUpperCase(); 
    switch (tokenUpper) {
      case 'USDC':
        balance = await this.usdc.balanceOf(targetAddress);
        decimals = await this.usdc.decimals();
        break;
      case 'CNGN':
        balance = await this.cngn.balanceOf(targetAddress);
        decimals = await this.cngn.decimals();
        break;
      default:
        throw new Error(`Unsupported token: ${_token}`);
    }

    if (balance === null || decimals === null) {
      return null;
    }

    if (balance === 0n) {
      return '0';
    }

    return ethers.formatUnits(balance, decimals);
  }

  /**
   * Get balance
   */
  async getBalance(tokenAddress: string, userAddress: string): Promise<string> {
    const token = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      this.provider,
    ) as ethers.Contract & ERC20Interface;
    const balance = await token.balanceOf(userAddress);
    const decimals = await token.decimals();
    return ethers.formatUnits(balance, decimals);
  }

  /**
   * Get user's USDC balance
   */
  async getUSDCBalance(userAddress?: string): Promise<string | null> {
    const balance = await this.usdc.balanceOf(
      userAddress ?? this.signer.getAddress(),
    );
    if (!balance) return null;
    return ethers.formatUnits(balance, TOKENS.USDC?.decimals ?? 6);
  }

  /**
   * Get user's CNGN balance
   */
  async getCNGNBalance(userAddress?: string): Promise<string | null> {
    const balance = await this.cngn.balanceOf(
      userAddress ?? this.signer.getAddress(),
    );
    if (!balance) return null;
    return ethers.formatUnits(balance, TOKENS.CNGN?.decimals ?? 18);
  }

  /**
   * Check if pair exists
   */
  async getPool(
    tokenA: string,
    tokenB: string,
    stable: boolean = false,
  ): Promise<string> {
    try {
      const pairAddress = await this.factory.getPool(tokenA, tokenB, stable);
      return pairAddress;
    } catch (error) {
      return ethers.ZeroAddress;
    }
  }

  /** Get token decimals */
  async getTokenDecimals() {
    const [usdcDecimals, cngnDecimals] = await Promise.all([
      this.usdc.decimals(),
      this.cngn.decimals(),
    ]);

    return {
      usdc: Number(usdcDecimals),
      cngn: Number(cngnDecimals),
    };
  }

  /** Get token balances */
  async getTokenBalances(address?: string) {
    const target = address ?? (await this.signer.getAddress());

    const [usdcBalance, usdcDecimals, cngnBalance, cngnDecimals] =
      await Promise.all([
        this.usdc.balanceOf(target),
        this.usdc.decimals(),
        this.cngn.balanceOf(target),
        this.cngn.decimals(),
      ]);

    return {
      usdc: ethers.formatUnits(usdcBalance, usdcDecimals),
      cngn: ethers.formatUnits(cngnBalance, cngnDecimals),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Ensure sufficient token allowance for router
   */
  private async ensureAllowance(
    tokenAddress: string,
    amount: bigint,
  ): Promise<void> {
    const token = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      this.signer,
    ) as ethers.Contract & ERC20Interface;
    const signerAddress = await this.signer.getAddress();

    const currentAllowance: bigint = await token.allowance(
      signerAddress,
      ADDRESSES.AERODROME.ROUTER,
    );
    console.log('Current allowance:', currentAllowance.toString());

    if (currentAllowance < amount) {
      console.log('Approving token spend...');
      try {
        const approveTx = await token.approve(
          ADDRESSES.AERODROME.ROUTER,
          ethers.MaxUint256,
        );
        const receipt = await approveTx.wait();
        if (!receipt || receipt.status !== 1) {
          throw new Error('Approval transaction failed');
        }
        console.log('Token approved successfully');
      } catch (err) {
        console.error('Token approval failed:', err);
        throw err;
      }
    } else {
      console.log('Sufficient allowance, no need to approve');
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create SDK instance with a provider and signer
 */
export function initializeSwapper(
  provider: ethers.Provider,
  signer: ethers.Signer,
): Swapper {
  return new Swapper(provider, signer);
}

/**
 * Create SDK instance from private key (server-side use)
 */
export function initializeSwapperFromPrivateKey(
  rpcUrl: string,
  privateKey: string,
): Swapper {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  return new Swapper(provider, signer);
}

export default Swapper;
