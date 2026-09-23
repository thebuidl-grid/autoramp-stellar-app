import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Chain as PrismaChain } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { SwapService } from '../swap/swap.service';
import { CorridorService } from '../corridor/corridor.service';
import { getAssetForCorridor, getUsdcAsset } from '../swap/config/constant';
import { ChainRegistryService } from './chain-registry.service';
import { ChainTokenRegistryService } from './chain-token-registry.service';
import { CctpAttestationClient } from './providers/cctp-attestation-client.service';
import { EvmRelayerService } from './providers/evm-relayer.service';
import { ZeroXSwapQuoteService } from './providers/zerox-swap-quote.service';
import { buildCctpForwarderHookData, hexToBuffer, stellarContractToBytes32 } from './cctp-encoding.util';
import { CreateBridgeTransferDto } from './dto/create-bridge-transfer.dto';
import { generateTrxReference } from '../../utils/reference.util';
import { ConfigService } from '@nestjs/config';
import { formatUnits } from 'viem';
import type { Hex, Address } from 'viem';
import { OfframpDeliveryService } from '../stablestack/offramp-delivery.service';

const ZERO_BYTES32 = ('0x' + '00'.repeat(32)) as Hex;

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly chainRegistry: ChainRegistryService,
    private readonly chainTokenRegistry: ChainTokenRegistryService,
    private readonly attestationClient: CctpAttestationClient,
    private readonly evmRelayer: EvmRelayerService,
    private readonly zeroXSwapQuote: ZeroXSwapQuoteService,
    private readonly swapService: SwapService,
    private readonly corridorService: CorridorService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => OfframpDeliveryService))
    private readonly offrampDeliveryService: OfframpDeliveryService,
  ) {}

  /**
   * Registers intent to bridge USDC from `dto.sourceChain` to
   * `dto.destinationChain` (defaults to 'stellar'), and returns unsigned
   * transaction(s) for the caller's own wallet to sign — self-custodial for
   * both source-chain types, no private key or user funds ever touch this
   * service:
   *  - sourceChain is Stellar: only the unsigned approve XDR
   *    (`approveTransactionXdr`) — the burn XDR can't be built yet, since
   *    its Soroban resource footprint depends on an allowance that only
   *    exists once the approve tx is actually confirmed on-chain. Call
   *    buildBurnTransaction() below for that, after submitting this one.
   *    (A Soroban transaction is protocol-limited to one
   *    invokeHostFunction operation, so approve() and deposit_for_burn()
   *    can't be batched into a single transaction either.)
   *  - sourceChain is EVM: two unsigned transactions (`approveTransaction`,
   *    `burnTransaction`) to submit in sequence — two txs instead of one
   *    because ERC-20 approve can't be batched into the burn call without
   *    EIP-5792, but (unlike Stellar) building both up front is fine since
   *    EVM calldata encoding doesn't require simulating against live state.
   */
  async createTransferIntent(dto: CreateBridgeTransferDto, userId?: string | null): Promise<{
    reference: string;
    sourceChain: string;
    destinationChain: string;
    approveTransactionXdr?: string;
    networkPassphrase?: string;
    approveTransaction?: { to: string; data: string; value: string };
    burnTransaction?: { to: string; data: string; value: string };
    // Multi-stablecoin bridge-in: present only when sourceTokenCode is a
    // non-USDC token — sign+submit these two ahead of approveTransaction/
    // burnTransaction, in order: approve the source token, then swap it to
    // USDC. Everything after that is identical to the plain-USDC flow.
    sourceSwapApproveTransaction?: { to: string; data: string; value: string };
    sourceSwapTransaction?: { to: string; data: string; value: string };
    estimatedSourceSwapUsdc?: string;
    estimatedPayoutAmount?: string;
    exchangeRate?: number;
  }> {
    const sourceChain = await this.chainRegistry.findByName(dto.sourceChain);
    const destinationChainName = dto.destinationChain || 'stellar';
    const destinationChain = await this.chainRegistry.findByName(destinationChainName);

    if (sourceChain.name === destinationChain.name) {
      throw new BadRequestException('sourceChain and destinationChain must differ — no bridge needed within the same chain');
    }

    // Multi-stablecoin bridge-in: convert a non-USDC sourceTokenCode to USDC
    // on the EVM source chain first, via 0x — everything downstream (the
    // burn amount, and the payout-leg quote below) uses the swap's
    // guaranteed-minimum USDC output (sourceSwap.minUsdc), not the raw
    // expectedAmount, which is denominated in sourceTokenCode's units, not
    // USDC's.
    const sourceTokenCode = (dto.sourceTokenCode || 'USDC').toUpperCase();
    let sourceSwap:
      | { approveTx: { to: string; data: string; value: string }; swapTx: { to: string; data: string; value: string }; quotedUsdc: string; minUsdc: string }
      | undefined;
    if (sourceTokenCode !== 'USDC') {
      if (sourceChain.chainType !== 'EVM') {
        throw new BadRequestException('sourceTokenCode requires an EVM sourceChain — a Stellar source trades its corridor stablecoin/XLM directly, not via this path');
      }
      if (!dto.sourceAddress) {
        throw new BadRequestException("sourceAddress (the connected EVM wallet's address) is required when sourceChain is an EVM chain");
      }
      if (dto.expectedAmount === undefined || dto.expectedAmount === null) {
        throw new BadRequestException('expectedAmount is required when sourceTokenCode is set — needed to quote the pre-burn swap');
      }

      const sellToken = await this.chainTokenRegistry.findByCode(sourceChain.name, sourceTokenCode);
      const sellAmountRaw = BigInt(Math.round(dto.expectedAmount * 10 ** sellToken.decimals)).toString();
      const quote = await this.zeroXSwapQuote.getSwapQuote({
        sourceChainName: sourceChain.name,
        sellTokenAddress: sellToken.address as Address,
        buyTokenAddress: sourceChain.usdcAddress as Address,
        sellAmount: sellAmountRaw,
        takerAddress: dto.sourceAddress as Address,
      });

      sourceSwap = {
        approveTx: this.evmRelayer.buildErc20ApproveTransaction({
          tokenAddress: sellToken.address as Address,
          spender: quote.allowanceTarget,
          amount: dto.expectedAmount.toString(),
          decimals: sellToken.decimals,
        }),
        swapTx: { to: quote.to, data: quote.data, value: quote.value },
        quotedUsdc: formatUnits(BigInt(quote.buyAmount), 6),
        minUsdc: formatUnits(BigInt(quote.minBuyAmount), 6),
      };
    }
    // The USDC amount actually available to bridge — either the untouched
    // expectedAmount (plain-USDC case) or the source swap's guaranteed
    // minimum (everything above that just ends up as USDC dust in the
    // user's wallet, harmless either way).
    const effectiveUsdcAmount = sourceSwap ? parseFloat(sourceSwap.minUsdc) : dto.expectedAmount;

    // Swap-tab payout: quote now (not at completion time, which can be
    // minutes later post-attestation) so the frontend can show an estimate
    // immediately, and so we have a floor to hold completion against if the
    // rate moves against the user in the meantime — see completeIfAttested.
    let payoutQuote: { destinationAmount: string; exchangeRate: number } | undefined;
    let payoutSlippage: number | undefined;
    let minPayoutAmount: number | undefined;
    if (dto.payoutStablecoinCode) {
      if (destinationChain.chainType !== 'STELLAR') {
        throw new BadRequestException('payoutStablecoinCode requires destinationChain to be stellar (corridor stablecoins are Stellar-only)');
      }
      // Validates the code up front so a typo fails at intent-creation,
      // not silently at completion time minutes later.
      await this.corridorService.findByStablecoinCode(dto.payoutStablecoinCode.toUpperCase());
      if (effectiveUsdcAmount === undefined || effectiveUsdcAmount === null) {
        throw new BadRequestException('expectedAmount is required when payoutStablecoinCode is set — needed to quote the payout up front');
      }

      const quote = await this.swapService.getSwapQuote('USDC', dto.payoutStablecoinCode.toUpperCase(), effectiveUsdcAmount);
      payoutSlippage = dto.payoutSlippage ?? 0.05;
      minPayoutAmount = parseFloat(quote.destinationAmount) * (1 - payoutSlippage);
      payoutQuote = { destinationAmount: quote.destinationAmount, exchangeRate: quote.exchangeRate };
    }

    // EVM destination follow-up swap: informational only at intent-creation
    // time — validates the token is registered on the destination chain so
    // a typo fails now, not when the user comes back after COMPLETED to
    // build the actual swap. No floor/PAYOUT_HELD needed: unlike the Stellar
    // payout leg, nothing is deferred here — the user signs against a LIVE
    // 0x quote fetched fresh by build-destination-swap, not one captured
    // minutes earlier.
    let payoutTokenCode: string | undefined;
    if (dto.payoutTokenCode) {
      if (dto.payoutStablecoinCode) {
        throw new BadRequestException('payoutTokenCode and payoutStablecoinCode are mutually exclusive');
      }
      if (destinationChain.chainType !== 'EVM') {
        throw new BadRequestException('payoutTokenCode requires an EVM destinationChain — Stellar payouts use payoutStablecoinCode instead');
      }
      payoutTokenCode = dto.payoutTokenCode.toUpperCase();
      await this.chainTokenRegistry.findByCode(destinationChain.name, payoutTokenCode);
    }

    // Sell tab fiat terminal: same redirect-to-distribution trick as
    // payoutStablecoinCode, but the completed transfer triggers a fiat
    // payout (BridgeService.deliverOfframp) instead of a stablecoin one —
    // reuses the same payoutSlippage/payoutQuote/minPayoutAmount variables
    // declared above (mutually exclusive with payoutStablecoinCode, so no
    // conflict), plus the corridor resolved here purely to validate the
    // currency and quote against, not stored.
    if (dto.payoutFiat) {
      if (dto.payoutStablecoinCode || dto.payoutTokenCode) {
        throw new BadRequestException('payoutFiat is mutually exclusive with payoutStablecoinCode/payoutTokenCode');
      }
      if (destinationChain.chainType !== 'STELLAR') {
        throw new BadRequestException('payoutFiat requires destinationChain to be stellar — the mint is redirected to AutoRamp\'s own distribution account there');
      }
      if (!userId) {
        throw new BadRequestException('payoutFiat requires an authenticated user — the resulting offramp record needs one');
      }
      if (!dto.payoutBankCode || !dto.payoutAccountNumber || !dto.payoutFiatCurrency) {
        throw new BadRequestException('payoutBankCode, payoutAccountNumber, and payoutFiatCurrency are all required when payoutFiat is set');
      }
      if (effectiveUsdcAmount === undefined || effectiveUsdcAmount === null) {
        throw new BadRequestException('expectedAmount is required when payoutFiat is set — needed to quote the payout up front');
      }

      // Validates the currency resolves to an active corridor now, not
      // silently at completion time.
      const corridor = await this.corridorService.findByCurrency(dto.payoutFiatCurrency.toUpperCase());
      const quote = await this.swapService.getSwapQuote('USDC', corridor.stablecoinCode, effectiveUsdcAmount);
      payoutSlippage = dto.payoutSlippage ?? 0.05;
      minPayoutAmount = parseFloat(quote.destinationAmount) * (1 - payoutSlippage);
      payoutQuote = { destinationAmount: quote.destinationAmount, exchangeRate: quote.exchangeRate };
    }

    // destinationAddress is only optional for payoutFiat — nothing is ever
    // delivered there in that case (buildDestinationEncoding's isPayout
    // branch redirects the mint to STELLAR_DISTRIBUTION_PUBLIC_KEY
    // regardless of what's passed here), so default to that same address
    // for the record rather than requiring the caller to supply one of
    // their own just for bookkeeping.
    let destinationAddress = dto.destinationAddress;
    if (!destinationAddress) {
      if (!dto.payoutFiat) {
        throw new BadRequestException('destinationAddress is required');
      }
      const distributionPublicKey = this.configService.get<string>('STELLAR_DISTRIBUTION_PUBLIC_KEY');
      if (!distributionPublicKey) {
        throw new BadRequestException('STELLAR_DISTRIBUTION_PUBLIC_KEY is required in config');
      }
      destinationAddress = distributionPublicKey;
    }

    const reference = generateTrxReference();
    // Validates the destination encoding is buildable up front, for both
    // branches — a bad Stellar destination config (missing forwarder,
    // etc.) should fail at intent-creation either way, not just for the
    // Stellar-source path that happens to consume the return value here.
    const { mintRecipient, destinationCaller, hookData } = this.buildDestinationEncoding(
      destinationChain,
      destinationAddress,
      !!dto.payoutStablecoinCode || !!dto.payoutFiat,
    );

    if (sourceChain.chainType === 'STELLAR') {
      if (!sourceChain.tokenMessengerAddress) {
        throw new BadRequestException('Stellar chain registry entry is missing tokenMessengerAddress');
      }
      if (!dto.sourceAddress) {
        throw new BadRequestException('sourceAddress (the connected Stellar wallet\'s public key) is required when sourceChain is stellar');
      }

      // Only the approve transaction is built here — the burn transaction
      // can't be simulated yet, because its resource footprint depends on
      // the allowance the approve tx grants, which doesn't exist on-chain
      // until the caller actually submits and confirms it. See
      // buildBurnTransaction below, called once that's done.
      const approveTransaction = await this.stellarService.buildCctpApproveTransaction({
        userPublicKey: dto.sourceAddress,
        tokenMessengerAddress: sourceChain.tokenMessengerAddress,
        usdcContractAddress: sourceChain.usdcAddress,
        amount: String(effectiveUsdcAmount ?? 0),
      });

      await this.prisma.bridgeTransfer.create({
        data: {
          reference,
          userId: userId || undefined,
          sourceChain: sourceChain.name,
          destinationChain: destinationChain.name,
          destinationAddress,
          expectedAmount: effectiveUsdcAmount,
          payoutStablecoinCode: dto.payoutStablecoinCode?.toUpperCase(),
          payoutTokenCode,
          ...(dto.payoutFiat && {
            payoutFiat: true,
            payoutBankCode: dto.payoutBankCode,
            payoutAccountNumber: dto.payoutAccountNumber,
            payoutFiatCurrency: dto.payoutFiatCurrency?.toUpperCase(),
          }),
          ...(payoutSlippage !== undefined && { payoutSlippage }),
          ...(payoutQuote && { quotedPayoutAmount: payoutQuote.destinationAmount }),
          ...(minPayoutAmount !== undefined && { minPayoutAmount }),
          status: 'PENDING_BURN',
        },
      });

      return {
        reference,
        sourceChain: sourceChain.name,
        destinationChain: destinationChain.name,
        approveTransactionXdr: approveTransaction.xdr,
        networkPassphrase: approveTransaction.networkPassphrase,
        estimatedPayoutAmount: payoutQuote?.destinationAmount,
        exchangeRate: payoutQuote?.exchangeRate,
      };
    }

    // EVM source: unsigned approve + burn calldata for the caller's own
    // connected wallet to submit — self-custodial, mirrors the Stellar
    // branch above.
    if (!dto.sourceAddress) {
      throw new BadRequestException("sourceAddress (the connected EVM wallet's address) is required when sourceChain is an EVM chain");
    }

    const { approveTx, burnTx } = this.evmRelayer.buildDepositForBurnTransactions({
      sourceChain,
      amount: String(effectiveUsdcAmount ?? 0),
      destinationDomain: destinationChain.cctpDomain,
      mintRecipient,
      destinationCaller,
      hookData,
    });

    await this.prisma.bridgeTransfer.create({
      data: {
        reference,
        userId: userId || undefined,
        sourceChain: sourceChain.name,
        destinationChain: destinationChain.name,
        destinationAddress,
        expectedAmount: effectiveUsdcAmount,
        payoutStablecoinCode: dto.payoutStablecoinCode?.toUpperCase(),
        payoutTokenCode,
        ...(dto.payoutFiat && {
          payoutFiat: true,
          payoutBankCode: dto.payoutBankCode,
          payoutAccountNumber: dto.payoutAccountNumber,
          payoutFiatCurrency: dto.payoutFiatCurrency?.toUpperCase(),
        }),
        ...(payoutSlippage !== undefined && { payoutSlippage }),
        ...(payoutQuote && { quotedPayoutAmount: payoutQuote.destinationAmount }),
        ...(minPayoutAmount !== undefined && { minPayoutAmount }),
        ...(sourceSwap && {
          sourceTokenCode,
          sourceSwapQuote: sourceSwap.quotedUsdc,
          sourceSwapMinUsdc: sourceSwap.minUsdc,
        }),
        status: 'PENDING_BURN',
      },
    });

    return {
      reference,
      sourceChain: sourceChain.name,
      destinationChain: destinationChain.name,
      approveTransaction: approveTx,
      burnTransaction: burnTx,
      sourceSwapApproveTransaction: sourceSwap?.approveTx,
      sourceSwapTransaction: sourceSwap?.swapTx,
      estimatedSourceSwapUsdc: sourceSwap?.minUsdc,
      estimatedPayoutAmount: payoutQuote?.destinationAmount,
      exchangeRate: payoutQuote?.exchangeRate,
    };
  }

  /**
   * Stellar-source step 2 of 2 (see createTransferIntent's doc comment):
   * builds the unsigned deposit_for_burn XDR, to be called only after the
   * caller has submitted and confirmed the approveTransactionXdr from
   * createTransferIntent — the burn tx's Soroban simulation needs the
   * real on-chain allowance to exist first, or it fails with HostError
   * Contract #9 ("not enough allowance to spend"). Re-derives the same
   * mintRecipient/destinationCaller/hookData createTransferIntent computed
   * from the transfer row rather than trusting client input for them.
   */
  async buildBurnTransaction(reference: string, sourceAddress: string): Promise<{ burnTransactionXdr: string; networkPassphrase: string }> {
    const transfer = await this.prisma.bridgeTransfer.findUnique({ where: { reference } });
    if (!transfer) {
      throw new NotFoundException(`Bridge transfer ${reference} not found`);
    }
    if (transfer.sourceChain !== 'stellar') {
      throw new BadRequestException(`buildBurnTransaction is only for Stellar-source transfers, not ${transfer.sourceChain}`);
    }

    const sourceChain = await this.chainRegistry.findByName(transfer.sourceChain);
    const destinationChain = await this.chainRegistry.findByName(transfer.destinationChain);
    if (!sourceChain.tokenMessengerAddress) {
      throw new BadRequestException('Stellar chain registry entry is missing tokenMessengerAddress');
    }

    const { mintRecipient, destinationCaller, hookData } = this.buildDestinationEncoding(
      destinationChain,
      transfer.destinationAddress,
      !!transfer.payoutStablecoinCode,
    );

    const burnTx = await this.stellarService.buildCctpBurnTransaction({
      userPublicKey: sourceAddress,
      tokenMessengerAddress: sourceChain.tokenMessengerAddress,
      usdcContractAddress: sourceChain.usdcAddress,
      amount: transfer.expectedAmount ? transfer.expectedAmount.toString() : '0',
      destinationDomain: destinationChain.cctpDomain,
      mintRecipient: hexToBuffer(mintRecipient),
      destinationCaller: hexToBuffer(destinationCaller),
      hookData: hookData ? hexToBuffer(hookData) : undefined,
    });

    return { burnTransactionXdr: burnTx.xdr, networkPassphrase: burnTx.networkPassphrase };
  }

  /**
   * EVM destination follow-up swap: once a transfer with payoutTokenCode
   * has COMPLETED (the mint already landed directly in the user's own
   * destinationAddress — see buildDestinationEncoding, unchanged), fetches
   * a LIVE 0x quote (USDC -> payoutTokenCode, taker = destinationAddress)
   * and returns unsigned approve+swap calldata for the user's own wallet on
   * destinationChain to sign — self-custodial, same shape createTransferIntent
   * already returns for the source-side swap. No floor/PAYOUT_HELD: the
   * user signs against this live quote immediately, nothing is deferred.
   */
  async buildDestinationSwap(reference: string): Promise<{
    approveTransaction: { to: string; data: string; value: string };
    swapTransaction: { to: string; data: string; value: string };
    estimatedOutput: string;
    minOutput: string;
  }> {
    const transfer = await this.prisma.bridgeTransfer.findUnique({ where: { reference } });
    if (!transfer) {
      throw new NotFoundException(`Bridge transfer ${reference} not found`);
    }
    if (transfer.status !== 'COMPLETED') {
      throw new BadRequestException(`Transfer ${reference} is not COMPLETED yet (currently ${transfer.status})`);
    }
    if (!transfer.payoutTokenCode) {
      throw new BadRequestException(`Transfer ${reference} has no payoutTokenCode set`);
    }

    const destinationChain = await this.chainRegistry.findByName(transfer.destinationChain);
    if (destinationChain.chainType !== 'EVM') {
      throw new BadRequestException('buildDestinationSwap is only for an EVM destinationChain');
    }

    return this.buildEvmSwap({
      chainName: destinationChain.name,
      sellTokenCode: 'USDC',
      buyTokenCode: transfer.payoutTokenCode,
      sellAmount: transfer.expectedAmount ? parseFloat(transfer.expectedAmount.toString()) : 0,
      takerAddress: transfer.destinationAddress,
    });
  }

  /**
   * Same-chain-only self-custodial swap between any two tokens registered
   * on an EVM chain (its own USDC, or any ChainToken) — no bridging, no
   * CCTP, nothing leaves the chain. Powers the Buy/Sell/Swap page's same-
   * chain "Swap" tab once a non-Stellar chain is picked there, and doubles
   * as buildDestinationSwap's implementation (USDC -> payoutTokenCode is
   * just one particular pair). Returns unsigned approve+swap calldata for
   * the caller's own connected wallet to sign — same shape/trust model as
   * every other EVM calldata this module builds.
   */
  async buildEvmSwap(params: {
    chainName: string;
    sellTokenCode: string;
    buyTokenCode: string;
    sellAmount: number;
    takerAddress: string;
  }): Promise<{
    approveTransaction: { to: string; data: string; value: string };
    swapTransaction: { to: string; data: string; value: string };
    estimatedOutput: string;
    minOutput: string;
  }> {
    const chain = await this.chainRegistry.findByName(params.chainName);
    if (chain.chainType !== 'EVM') {
      throw new BadRequestException('buildEvmSwap is only for EVM chains — a Stellar same-chain swap already uses SwapService/PathPaymentStrictSend');
    }

    const sellCode = params.sellTokenCode.toUpperCase();
    const buyCode = params.buyTokenCode.toUpperCase();
    if (sellCode === buyCode) {
      throw new BadRequestException('sellTokenCode and buyTokenCode must differ');
    }

    const resolveToken = async (code: string): Promise<{ address: string; decimals: number }> => {
      if (code === 'USDC') return { address: chain.usdcAddress, decimals: 6 };
      const token = await this.chainTokenRegistry.findByCode(chain.name, code);
      return { address: token.address, decimals: token.decimals };
    };

    const sellToken = await resolveToken(sellCode);
    const buyToken = await resolveToken(buyCode);
    const sellAmountRaw = BigInt(Math.round(params.sellAmount * 10 ** sellToken.decimals)).toString();

    const quote = await this.zeroXSwapQuote.getSwapQuote({
      sourceChainName: chain.name,
      sellTokenAddress: sellToken.address as Address,
      buyTokenAddress: buyToken.address as Address,
      sellAmount: sellAmountRaw,
      takerAddress: params.takerAddress as Address,
    });

    const approveTransaction = this.evmRelayer.buildErc20ApproveTransaction({
      tokenAddress: sellToken.address as Address,
      spender: quote.allowanceTarget,
      amount: params.sellAmount.toString(),
      decimals: sellToken.decimals,
    });

    return {
      approveTransaction,
      swapTransaction: { to: quote.to, data: quote.data, value: quote.value },
      estimatedOutput: formatUnits(BigInt(quote.buyAmount), buyToken.decimals),
      minOutput: formatUnits(BigInt(quote.minBuyAmount), buyToken.decimals),
    };
  }

  /**
   * Custodial counterpart to createTransferIntent's Stellar-source branch —
   * called by OnrampDeliveryService once it has already swapped a
   * corridor stablecoin into USDC inside AutoRamp's own distribution
   * account (via StellarService.swapFromDistribution) and now needs to
   * bridge that USDC out to a user's chosen EVM chain automatically, with
   * no extra signature. Executes the approve+burn immediately (server-side,
   * via StellarService.executeCctpBurnFromDistribution) instead of
   * returning unsigned XDR, then records the transfer already past the
   * burn step — BridgeRelayerService's existing polling loop
   * (findAndCompletePendingTransfers/completeIfAttested) takes over
   * unchanged from there, including the payoutTokenCode follow-up-swap
   * path if set.
   */
  async createCustodialTransferFromDistribution(params: {
    userId?: string | null;
    destinationChain: string;
    destinationAddress: string;
    usdcAmount: string;
    payoutTokenCode?: string;
  }): Promise<string> {
    const sourceChain = await this.chainRegistry.findByName('stellar');
    const destinationChain = await this.chainRegistry.findByName(params.destinationChain);
    if (destinationChain.chainType !== 'EVM') {
      throw new BadRequestException('createCustodialTransferFromDistribution is only for an EVM destinationChain');
    }
    if (!sourceChain.tokenMessengerAddress) {
      throw new BadRequestException('Stellar chain registry entry is missing tokenMessengerAddress');
    }

    let payoutTokenCode: string | undefined;
    if (params.payoutTokenCode) {
      payoutTokenCode = params.payoutTokenCode.toUpperCase();
      await this.chainTokenRegistry.findByCode(destinationChain.name, payoutTokenCode);
    }

    const { mintRecipient, destinationCaller, hookData } = this.buildDestinationEncoding(
      destinationChain,
      params.destinationAddress,
      false,
    );

    const reference = generateTrxReference();
    const burnTxHash = await this.stellarService.executeCctpBurnFromDistribution({
      tokenMessengerAddress: sourceChain.tokenMessengerAddress,
      usdcContractAddress: sourceChain.usdcAddress,
      amount: params.usdcAmount,
      destinationDomain: destinationChain.cctpDomain,
      mintRecipient: hexToBuffer(mintRecipient),
      destinationCaller: hexToBuffer(destinationCaller),
      hookData: hookData ? hexToBuffer(hookData) : undefined,
    });

    await this.prisma.bridgeTransfer.create({
      data: {
        reference,
        userId: params.userId || undefined,
        sourceChain: sourceChain.name,
        destinationChain: destinationChain.name,
        destinationAddress: params.destinationAddress,
        expectedAmount: params.usdcAmount,
        payoutTokenCode,
        burnTxHash,
        status: 'BURNED',
      },
    });

    return reference;
  }

  /**
   * Encodes where the CCTP mint should land: a Stellar destination always
   * uses the CctpForwarder trick (mintRecipient/destinationCaller both the
   * forwarder contract, hookData carries the real recipient) — UNLESS
   * this is a Swap-tab payout, in which case the real recipient is
   * AutoRamp's own distribution account (so it can hold the USDC as
   * backing before minting the equivalent corridor stablecoin out — see
   * completeIfAttested). An EVM destination mints straight to the
   * recipient address, no forwarder needed.
   */
  private buildDestinationEncoding(
    destinationChain: PrismaChain,
    destinationAddress: string,
    isPayout: boolean,
  ): { mintRecipient: Hex; destinationCaller: Hex; hookData?: Hex } {
    if (destinationChain.chainType === 'STELLAR') {
      if (!destinationChain.cctpForwarderAddress) {
        throw new BadRequestException('Stellar chain registry entry is missing cctpForwarderAddress');
      }
      const forwardTo = isPayout
        ? this.configService.get<string>('STELLAR_DISTRIBUTION_PUBLIC_KEY')
        : destinationAddress;
      if (!forwardTo) {
        throw new BadRequestException('STELLAR_DISTRIBUTION_PUBLIC_KEY is required in config for a Swap-tab payout');
      }
      const forwarderBytes32 = stellarContractToBytes32(destinationChain.cctpForwarderAddress) as Hex;
      return {
        mintRecipient: forwarderBytes32,
        destinationCaller: forwarderBytes32,
        hookData: buildCctpForwarderHookData(forwardTo) as Hex,
      };
    }

    // EVM destination: mints straight to the address, permissionless
    // completion (zero destinationCaller) so any relayer — normally ours,
    // via EvmRelayerService.mint — can complete it once attested.
    return {
      mintRecipient: EvmRelayerService.addressToBytes32(destinationAddress as Address),
      destinationCaller: ZERO_BYTES32,
    };
  }

  /**
   * Caller reports the burn transaction hash once they've submitted it
   * (Stellar-source case — the frontend signs buildCctpBurnTransactions'
   * burn XDR and reports the resulting hash here). We don't just trust this —
   * the relayer only proceeds once Circle's attestation service
   * independently confirms the burn, same "verify on-chain before
   * trusting client input" discipline as
   * StablestackService.confirmOfframpDeposit.
   */
  async registerBurn(reference: string, burnTxHash: string): Promise<any> {
    const transfer = await this.prisma.bridgeTransfer.findUnique({ where: { reference } });
    if (!transfer) {
      throw new NotFoundException(`Bridge transfer ${reference} not found`);
    }
    if (transfer.status !== 'PENDING_BURN') {
      return transfer; // idempotent — already past this step
    }

    return this.prisma.bridgeTransfer.update({
      where: { id: transfer.id },
      data: { burnTxHash, status: 'BURNED' },
    });
  }

  async getStatus(reference: string): Promise<any> {
    const transfer = await this.prisma.bridgeTransfer.findUnique({ where: { reference } });
    if (!transfer) {
      throw new NotFoundException(`Bridge transfer ${reference} not found`);
    }
    return transfer;
  }

  /**
   * Read-only USDC balance lookup for an arbitrary address on a
   * registered chain — powers the Send/Swap UI's "you have $X available"
   * display. Never used for anything money-moving; just a convenience
   * read so the user doesn't have to check their own wallet elsewhere.
   */
  async getUsdcBalanceForAddress(chainName: string, address: string): Promise<{ chain: string; address: string; balance: string }> {
    const chain = await this.chainRegistry.findByName(chainName);

    if (chain.chainType === 'STELLAR') {
      const balance = await this.stellarService.getBalance(address, getUsdcAsset());
      return { chain: chainName, address, balance: balance ?? '0' };
    }

    const raw = await this.evmRelayer.getUsdcBalance(chainName, chain, address as Address);
    return { chain: chainName, address, balance: this.evmRelayer.formatUsdc(raw) };
  }

  /**
   * Scans BURNED transfers, polls for their attestation, and completes
   * the destination-chain mint once available. Called by
   * BridgeRelayerService's @Interval loop — mirrors
   * StablestackService.findAndConfirmPendingDeposits exactly (per-item
   * try/catch so one failure doesn't stop the batch).
   */
  async findAndCompletePendingTransfers(): Promise<{ checked: number; completed: number }> {
    // Also retries ATTESTED transfers, not just BURNED ones — a transfer
    // that got attested but then failed at the mint step (e.g. missing
    // relayer config) used to fall out of this query forever, since it's
    // no longer BURNED but was never actually completed either. Attestation
    // is proof the burn happened, so re-attempting the mint here is safe
    // and doesn't re-touch Circle's attestation service at all.
    const pending = await this.prisma.bridgeTransfer.findMany({
      where: { status: { in: ['BURNED', 'ATTESTED'] }, burnTxHash: { not: null } },
    });

    let completed = 0;
    for (const transfer of pending) {
      try {
        const didComplete = await this.completeIfAttested(transfer);
        if (didComplete) completed++;
      } catch (error: any) {
        this.logger.error(`Bridge relayer: failed completing transfer ${transfer.reference}: ${error.message}`);
      }
    }

    return { checked: pending.length, completed };
  }

  private async completeIfAttested(transfer: {
    id: string;
    reference: string;
    burnTxHash: string | null;
    status: string;
    userId: string | null;
    sourceChain: string;
    destinationChain: string;
    destinationAddress: string;
    payoutStablecoinCode: string | null;
    payoutFiat: boolean;
    payoutBankCode: string | null;
    payoutAccountNumber: string | null;
    payoutFiatCurrency: string | null;
    expectedAmount: any;
    minPayoutAmount: any;
    rawMessage: string | null;
    rawAttestation: string | null;
  }): Promise<boolean> {
    let message = transfer.rawMessage;
    let attestation = transfer.rawAttestation;

    if (transfer.status === 'BURNED') {
      if (!transfer.burnTxHash) return false;

      const sourceChain = await this.chainRegistry.findByName(transfer.sourceChain);
      const fetched = await this.attestationClient.getAttestation(transfer.burnTxHash, sourceChain.cctpDomain);
      if (!fetched) return false; // not ready yet — expected, common outcome

      const claim = await this.prisma.bridgeTransfer.updateMany({
        where: { id: transfer.id, status: 'BURNED' },
        data: { status: 'ATTESTED', rawMessage: fetched.message, rawAttestation: fetched.attestation },
      });
      if (claim.count === 0) return false; // already claimed by another tick
      message = fetched.message;
      attestation = fetched.attestation;
    } else if (transfer.status !== 'ATTESTED') {
      return false;
    }

    // Already attested (either just now, or on a prior tick that failed
    // partway through minting) — message/attestation must be present.
    if (!message || !attestation) return false;

    const destinationChain = await this.chainRegistry.findByName(transfer.destinationChain);

    try {
      const mintTxHash =
        destinationChain.chainType === 'STELLAR'
          ? await this.stellarService.mintCctpTransfer({
              cctpForwarderAddress: this.requireForwarder(destinationChain),
              message: hexToBuffer(message),
              attestation: hexToBuffer(attestation),
            })
          : await this.evmRelayer.mint(
              destinationChain,
              message as Hex,
              attestation as Hex,
            );

      await this.prisma.bridgeTransfer.update({
        where: { id: transfer.id },
        data: { status: 'COMPLETED', mintTxHash, completedAt: new Date() },
      });

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'bridge',
          transactionId: transfer.id,
          userId: transfer.userId,
          action: 'status_changed',
          oldStatus: 'ATTESTED',
          newStatus: 'COMPLETED',
          description: `CCTP mint completed on ${destinationChain.name}: ${mintTxHash}`,
        },
      });

      this.logger.log(`Bridge transfer ${transfer.reference} completed: ${mintTxHash}`);

      if (transfer.payoutStablecoinCode) {
        await this.payoutCorridorStablecoin(transfer);
      } else if (transfer.payoutFiat) {
        await this.deliverOfframp(transfer);
      }

      return true;
    } catch (error: any) {
      // Attestation is proof the burn happened — don't silently drop this
      // transfer on a transient mint failure. Left in ATTESTED (not
      // reverted to BURNED) so a retry doesn't risk double-submitting to
      // Circle; the same message+attestation can be resubmitted safely
      // since mint completion is idempotent per Circle's own message
      // nonce tracking. findAndCompletePendingTransfers now polls ATTESTED
      // rows too (not just BURNED), so this genuinely gets retried on the
      // next tick rather than sitting here forever — this used to be a
      // known, deliberately-deferred gap; a real user's already-burned
      // funds sitting stuck at ATTESTED (on a missing relayer key) is what
      // finally made it worth fixing.
      await this.prisma.bridgeTransfer.update({
        where: { id: transfer.id },
        data: { errorMessage: error.message },
      });
      throw error;
    }
  }

  private requireForwarder(chain: PrismaChain): string {
    if (!chain.cctpForwarderAddress) {
      throw new BadRequestException(`Chain ${chain.name} registry entry is missing cctpForwarderAddress`);
    }
    return chain.cctpForwarderAddress;
  }

  /**
   * Swap tab's final leg: the bridged USDC landed in AutoRamp's own
   * Stellar distribution account (see buildDestinationEncoding's isPayout
   * branch) — mint the equivalent corridor stablecoin straight to the
   * user, same call WebhookService already uses to pay out onramps. No
   * on-chain swap needed server-side: sized by a live quote, paid from
   * AutoRamp's own issuance, exactly like today's fiat onramp.
   *
   * The live quote fetched here can differ from the one createTransferIntent
   * captured minutes earlier (CCTP attestation takes a while) — if it's
   * moved beyond transfer.minPayoutAmount, don't silently pay out less than
   * that floor promised. The USDC is already safely sitting in the
   * distribution account, so holding for manual review is zero-custodial-
   * risk, unlike guessing at a "close enough" amount.
   */
  private async payoutCorridorStablecoin(transfer: {
    id: string;
    reference: string;
    destinationAddress: string;
    payoutStablecoinCode: string | null;
    expectedAmount: any;
    minPayoutAmount: any;
  }): Promise<void> {
    if (!transfer.payoutStablecoinCode || !transfer.expectedAmount) return;

    const corridor = await this.corridorService.findByStablecoinCode(transfer.payoutStablecoinCode);
    const quote = await this.swapService.getSwapQuote(
      'USDC',
      corridor.stablecoinCode,
      parseFloat(String(transfer.expectedAmount)),
    );

    const minPayoutAmount = transfer.minPayoutAmount !== null && transfer.minPayoutAmount !== undefined
      ? parseFloat(String(transfer.minPayoutAmount))
      : undefined;
    if (minPayoutAmount !== undefined && parseFloat(quote.destinationAmount) < minPayoutAmount) {
      await this.prisma.bridgeTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'PAYOUT_HELD',
          errorMessage: `Payout quote ${quote.destinationAmount} ${corridor.stablecoinCode} fell below the ${minPayoutAmount} floor set at intent creation — held for manual review instead of paying out short.`,
        },
      });
      this.logger.warn(
        `Bridge transfer ${transfer.reference}: payout held — live quote ${quote.destinationAmount} ${corridor.stablecoinCode} below floor ${minPayoutAmount}`,
      );
      return;
    }

    const payoutTxHash = await this.stellarService.sendFromDistribution({
      asset: getAssetForCorridor(corridor),
      amount: quote.destinationAmount,
      destination: transfer.destinationAddress,
    });

    await this.prisma.bridgeTransfer.update({
      where: { id: transfer.id },
      data: { payoutAmount: quote.destinationAmount, payoutTxHash },
    });

    this.logger.log(
      `Bridge transfer ${transfer.reference}: paid out ${quote.destinationAmount} ${corridor.stablecoinCode} (${payoutTxHash})`,
    );
  }

  /**
   * Sell tab's fiat terminal: the bridged USDC landed in AutoRamp's own
   * Stellar distribution account (see buildDestinationEncoding's isPayout
   * branch, same redirect payoutCorridorStablecoin uses) — quote its fiat
   * value and pay out directly via OfframpDeliveryService, bypassing the
   * usual memo-watch step entirely since custody is already proven. Same
   * floor/PAYOUT_HELD pattern as payoutCorridorStablecoin: the live quote
   * fetched here can differ from the one createTransferIntent captured
   * minutes earlier, and the USDC is already safely held, so holding for
   * manual review beats guessing at a "close enough" fiat amount.
   */
  private async deliverOfframp(transfer: {
    id: string;
    reference: string;
    userId: string | null;
    payoutBankCode: string | null;
    payoutAccountNumber: string | null;
    payoutFiatCurrency: string | null;
    expectedAmount: any;
    minPayoutAmount: any;
  }): Promise<void> {
    if (!transfer.payoutBankCode || !transfer.payoutAccountNumber || !transfer.payoutFiatCurrency || !transfer.expectedAmount) return;
    if (!transfer.userId) {
      // Shouldn't happen in practice — Sell requires an AutoRamp login — but
      // OfframpTransaction.userId is a required column, so this can't
      // proceed without one. Held rather than crashing on an insert.
      await this.prisma.bridgeTransfer.update({
        where: { id: transfer.id },
        data: { status: 'PAYOUT_HELD', errorMessage: 'payoutFiat set but transfer has no userId — cannot create the offramp record. Held for manual review.' },
      });
      this.logger.error(`Bridge transfer ${transfer.reference}: payoutFiat set but userId is null — held for manual review.`);
      return;
    }

    const corridor = await this.corridorService.findByCurrency(transfer.payoutFiatCurrency);
    const quote = await this.swapService.getSwapQuote('USDC', corridor.stablecoinCode, parseFloat(String(transfer.expectedAmount)));

    const minPayoutAmount = transfer.minPayoutAmount !== null && transfer.minPayoutAmount !== undefined
      ? parseFloat(String(transfer.minPayoutAmount))
      : undefined;
    if (minPayoutAmount !== undefined && parseFloat(quote.destinationAmount) < minPayoutAmount) {
      await this.prisma.bridgeTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'PAYOUT_HELD',
          errorMessage: `Fiat payout quote ${quote.destinationAmount} ${transfer.payoutFiatCurrency} fell below the ${minPayoutAmount} floor set at intent creation — held for manual review instead of paying out short.`,
        },
      });
      this.logger.warn(
        `Bridge transfer ${transfer.reference}: fiat payout held — live quote ${quote.destinationAmount} ${transfer.payoutFiatCurrency} below floor ${minPayoutAmount}`,
      );
      return;
    }

    const { offrampReference } = await this.offrampDeliveryService.executePayout({
      userId: transfer.userId,
      fiatAmount: quote.destinationAmount,
      fiatCurrency: transfer.payoutFiatCurrency,
      bankCode: transfer.payoutBankCode,
      accountNumber: transfer.payoutAccountNumber,
      bridgeReference: transfer.reference,
    });

    await this.prisma.bridgeTransfer.update({
      where: { id: transfer.id },
      data: { payoutAmount: quote.destinationAmount },
    });

    this.logger.log(
      `Bridge transfer ${transfer.reference}: paid out ${quote.destinationAmount} ${transfer.payoutFiatCurrency} via offramp ${offrampReference}`,
    );
  }
}
