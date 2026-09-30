import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Address, Hex } from 'viem';

const ZEROX_BASE_URL = 'https://api.0x.org';

// Circle's CCTP domain ids double as a convenient EVM-chain-name lookup
// elsewhere in this module (ChainRegistryService), but 0x's API is keyed by
// the chain's real EVM chainId, not the CCTP domain — hence this separate
// map. Extend alongside EvmRelayerService's VIEM_CHAINS when a new EVM
// chain is added (see chain-registry.service.ts's "adding a chain is a
// row, not a code change" — this map plus that one are the two places that
// still need a code change, both because they wrap third-party APIs keyed
// by chain identifiers this app doesn't itself define).
//
// Chain ids themselves are standard, stable network parameters (verified
// against the installed viem/chains package's own definitions, not
// retyped from memory) — unlike a contract address, a wrong one here just
// fails loudly against 0x's API rather than silently misdirecting funds.
// One real caveat: 0x's public API has historically had limited/no
// testnet coverage for several of these chains — a "chainId mapped but 0x
// itself 400s" failure here is expected on some testnets, not a bug in
// this mapping.
const EVM_CHAIN_IDS: Record<string, number> = {
  base: 8453,
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
};
const EVM_CHAIN_IDS_TESTNET: Record<string, number> = {
  base: 84532,
  ethereum: 11155111,
  arbitrum: 421614,
  optimism: 11155420,
  polygon: 80002,
  avalanche: 43113,
};

export interface ZeroXSwapQuote {
  to: Address;
  data: Hex;
  value: string; // wei, decimal string
  // Guaranteed-minimum buy amount (raw token units, per buyToken's
  // decimals) — 0x computes this from the requested slippageBps. This,
  // not the point-estimate buyAmount, is what callers should treat as the
  // amount that will actually be available post-swap.
  minBuyAmount: string;
  buyAmount: string; // point estimate, for display only
  // Contract the sellToken allowance must be granted to before submitting
  // `to`/`data` — NOT necessarily the same as `to` (0x may route through a
  // dedicated AllowanceHolder contract). Build the ERC-20 approve tx
  // against this address, not against `to`.
  allowanceTarget: Address;
}

/**
 * Wraps 0x's Swap API (Allowance Holder flow — classic approve-then-call,
 * matching this app's existing CCTP approve+burn pattern, rather than the
 * Permit2 signature flow) to price and build calldata for converting a
 * non-USDC stablecoin (USDT, DAI, ...) into USDC on an EVM source chain,
 * ahead of the existing depositForBurn(WithHook) call. Docs:
 * https://0x.org/docs/api#tag/Swap/operation/swap::allowanceHolder::getQuote
 *
 * NOT yet verified against a live 0x API key/response — same "built from
 * docs alone, verify before trusting with real funds" caveat this codebase
 * already applies to the CCTP contract ABIs in EvmRelayerService.
 */
@Injectable()
export class ZeroXSwapQuoteService {
  private readonly logger = new Logger(ZeroXSwapQuoteService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private isMainnet(): boolean {
    return this.configService.get<string>('STELLAR_NETWORK') === 'mainnet';
  }

  private chainId(chainName: string): number {
    const map = this.isMainnet() ? EVM_CHAIN_IDS : EVM_CHAIN_IDS_TESTNET;
    const chainId = map[chainName];
    if (!chainId) {
      throw new BadRequestException(`ZeroXSwapQuoteService has no chainId mapping for "${chainName}"`);
    }
    return chainId;
  }

  private apiKey(): string {
    const key = this.configService.get<string>('ZEROX_API_KEY');
    if (!key) {
      throw new BadRequestException('ZEROX_API_KEY missing in config — required to quote a non-USDC source token swap');
    }
    return key;
  }

  /**
   * Quotes converting `sellAmount` (raw units) of `sellTokenAddress` into
   * USDC (`buyTokenAddress`), and returns ready-to-sign swap calldata for
   * `takerAddress` (the connected wallet — 0x builds calldata for a
   * specific taker, it isn't reusable across addresses) plus the
   * allowance target to approve first.
   */
  async getSwapQuote(params: {
    sourceChainName: string;
    sellTokenAddress: Address;
    buyTokenAddress: Address; // the chain's USDC
    sellAmount: string; // raw units, decimal string
    takerAddress: Address;
    slippageBps?: number; // defaults to 100 (1%)
  }): Promise<ZeroXSwapQuote> {
    const chainId = this.chainId(params.sourceChainName);
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${ZEROX_BASE_URL}/swap/allowance-holder/quote`, {
          headers: { '0x-api-key': this.apiKey(), '0x-version': 'v2' },
          params: {
            chainId,
            sellToken: params.sellTokenAddress,
            buyToken: params.buyTokenAddress,
            sellAmount: params.sellAmount,
            taker: params.takerAddress,
            slippageBps: params.slippageBps ?? 100,
          },
        }),
      );

      const data = response.data;
      if (data?.liquidityAvailable === false || !data?.transaction) {
        throw new BadRequestException('No swap route available for this token pair/amount');
      }

      return {
        to: data.transaction.to,
        data: data.transaction.data,
        value: data.transaction.value ?? '0',
        buyAmount: data.buyAmount,
        minBuyAmount: data.minBuyAmount ?? data.buyAmount,
        allowanceTarget: data.issues?.allowance?.spender ?? data.transaction.to,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`0x swap quote failed: ${error.message}`);
      throw new BadRequestException(`Failed to get swap quote from 0x: ${error.message}`);
    }
  }
}
