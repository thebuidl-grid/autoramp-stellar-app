import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { SwapService } from '../swap/swap.service';
import { BridgeService } from '../bridge/bridge.service';
import { getAssetForCorridor, getBridgeUsdcAsset } from '../swap/config/constant';
import type { Corridor } from '@prisma/client';

/** Same floor the rest of the app applies to a deferred/live-quoted swap leg. */
const DEFAULT_SLIPPAGE = 0.05;

/**
 * Delivers an onramp to a target other than "the corridor's own stablecoin,
 * straight to the user's Stellar wallet" — the one case
 * WebhookService.completeOnrampTransaction still handles inline via a plain
 * sendFromDistribution. Called once the fiat payment is confirmed, from
 * inside the same custody window that already exists the instant a
 * corridor stablecoin is minted (see StellarService.sendFromDistribution's
 * doc comment) — this just extends it one or two hops further, entirely
 * server-side, no extra user signature.
 */
@Injectable()
export class OnrampDeliveryService {
  private readonly logger = new Logger(OnrampDeliveryService.name);

  constructor(
    private readonly stellarService: StellarService,
    private readonly swapService: SwapService,
    private readonly bridgeService: BridgeService,
  ) {}

  async deliverOnramp(params: {
    userId: string;
    corridor: Pick<Corridor, 'stablecoinCode' | 'stablecoinIssuer'>;
    mintAmount: string;
    payoutChain: string;
    payoutTokenCode: string | null;
    destinationAddress: string;
  }): Promise<{ mintTxHash?: string; bridgeReference?: string }> {
    const corridorAsset = getAssetForCorridor(params.corridor);
    const corridorCode = params.corridor.stablecoinCode.toUpperCase();
    const targetTokenCode = (params.payoutTokenCode || corridorCode).toUpperCase();

    if (params.payoutChain === 'stellar') {
      // Stellar-side target: a different corridor's stablecoin, or plain
      // USDC/XLM/BRIDGE_USDC — one swap hop inside the distribution
      // account (skipped entirely if the target is the corridor's own
      // asset), then a plain payment out, same as today's default path.
      let payoutAsset = corridorAsset;
      let payoutAmount = params.mintAmount;

      if (targetTokenCode !== corridorCode) {
        payoutAsset = await this.swapService.resolveAsset(targetTokenCode);
        const quote = await this.stellarService.getStrictSendQuote(corridorAsset, params.mintAmount, payoutAsset);
        const destMin = (parseFloat(quote.destinationAmount) * (1 - DEFAULT_SLIPPAGE)).toFixed(7);
        await this.stellarService.swapFromDistribution({
          sendAsset: corridorAsset,
          sendAmount: params.mintAmount,
          destAsset: payoutAsset,
          destMin,
          path: quote.path,
        });
        payoutAmount = quote.destinationAmount;
      }

      const mintTxHash = await this.stellarService.sendFromDistribution({
        asset: payoutAsset,
        amount: payoutAmount,
        destination: params.destinationAddress,
      });
      this.logger.log(`Onramp delivered ${payoutAmount} ${targetTokenCode} on stellar: ${mintTxHash}`);
      return { mintTxHash };
    }

    // EVM target: swap the corridor stablecoin into Circle's real,
    // CCTP-bridgeable USDC (NOT the app's own self-issued hub 'USDC' —
    // see getBridgeUsdcAsset's doc comment; only this asset's Soroban SAC
    // is what the TokenMessenger contract actually recognizes as burn_token),
    // then bridge it out via a custodial CCTP burn. The mint itself still
    // lands directly in the user's own destinationAddress on the target
    // chain — no custody there, same as every other bridge completion.
    const bridgeUsdcAsset = getBridgeUsdcAsset();
    const usdcQuote = await this.stellarService.getStrictSendQuote(corridorAsset, params.mintAmount, bridgeUsdcAsset);
    const usdcMin = (parseFloat(usdcQuote.destinationAmount) * (1 - DEFAULT_SLIPPAGE)).toFixed(7);
    await this.stellarService.swapFromDistribution({
      sendAsset: corridorAsset,
      sendAmount: params.mintAmount,
      destAsset: bridgeUsdcAsset,
      destMin: usdcMin,
      path: usdcQuote.path,
    });

    const bridgeReference = await this.bridgeService.createCustodialTransferFromDistribution({
      userId: params.userId,
      destinationChain: params.payoutChain,
      destinationAddress: params.destinationAddress,
      usdcAmount: usdcQuote.destinationAmount,
      payoutTokenCode: targetTokenCode !== 'USDC' ? targetTokenCode : undefined,
    });
    this.logger.log(`Onramp bridging ${usdcQuote.destinationAmount} USDC to ${params.payoutChain}: bridge transfer ${bridgeReference}`);
    return { bridgeReference };
  }
}
