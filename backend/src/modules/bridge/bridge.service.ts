import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import {
  BridgeKit,
  type BridgeChainIdentifier,
  type BridgeParams,
  type BridgeResult,
} from '@circle-fin/bridge-kit';
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';
import { PrismaService } from '../../database/prisma.service';
import { BridgeTransferDto } from './dto/bridge-transfer.dto';
import { BridgeEstimateDto } from './dto/bridge-estimate.dto';
import { normalizeBridgeStatus } from './bridge-status';

export interface BridgeDeliveryInput {
  reference: string;
  oframpFundingReference: string;
  destinationTxHash?: string;
  status?: string;
  amount?: string;
}

/**
 * Delivery states a bridge provider may report. Anything else is rejected at
 * the /bridge/delivery boundary so a typo cannot poison the funding mirror.
 */
const KNOWN_DELIVERY_STATUSES: readonly string[] = [
  'SUCCESS',
  'PENDING',
  'PROCESSING',
  'WAITING',
  'DELAYED',
  'STUCK',
  'FAILED',
  'REJECTED',
  'REVERSED',
];

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  // Supported chains (BSC/BNB Chain is NOT supported by CCTP/Bridge Kit).
  // Any-to-any within these: Ethereum, Base, Solana and Stellar (plus their
  // testnets). Stellar is the D2 leg (Circle CCTP v2 domain 23, minted via
  // the CctpForwarder / Circle relayer).
  private readonly supportedChains = [
    'Ethereum',
    'Base',
    'Solana',
    'Stellar',
    'Ethereum_Sepolia',
    'Base_Sepolia',
    'Solana_Devnet',
    'Stellar_Testnet',
  ];

  private bridgeKitInstance?: BridgeKit;
  private sourceAdapterInstance?: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.initializeBridgeKit();
  }

  private async initializeBridgeKit() {
    try {
      this.logger.log('Bridge Kit initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Bridge Kit:', error);
      throw error;
    }
  }

  private get sourceChain(): string {
    return this.configService.get<string>('CCTP_SOURCE_CHAIN') || 'Base';
  }

  private get destinationChain(): string {
    return this.configService.get<string>('CCTP_DESTINATION_CHAIN') || 'Stellar';
  }

  private get transferSpeed(): 'FAST' | 'SLOW' {
    const speed = this.configService.get<string>('CCTP_BRIDGE_SPEED');
    return speed === 'SLOW' ? 'SLOW' : 'FAST';
  }

  private getBridgeKit(): BridgeKit {
    if (!this.bridgeKitInstance) {
      const privateKey = this.configService.get<string>('CCTP_BRIDGE_PRIVATE_KEY');
      if (!privateKey) {
        throw new BadRequestException('Bridge signing key CCTP_BRIDGE_PRIVATE_KEY is not configured');
      }
      const adapter = createViemAdapterFromPrivateKey({
        privateKey: privateKey as `0x${string}`,
      });
      this.sourceAdapterInstance = adapter;
      this.bridgeKitInstance = new BridgeKit();
    }
    return this.bridgeKitInstance;
  }

  /**
   * Execute a cross-chain USDC bridge transfer
   */
  /**
   * Initiate a cross-chain USDC bridge transfer record
   */
  async initiateBridge(
    dto: BridgeTransferDto,
    userId?: string,
    merchantId?: string,
    apiKeyId?: string,
  ) {
    const { fromChain, toChain, amount, destinationAddress, sourceAddress } =
      dto;

    // Validate chains
    if (!this.supportedChains.includes(fromChain)) {
      throw new BadRequestException(`Chain ${fromChain} is not supported.`);
    }

    if (!this.supportedChains.includes(toChain)) {
      throw new BadRequestException(`Chain ${toChain} is not supported.`);
    }

    try {
      const reference = `BRG-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const bridgeTransaction = await this.prisma.bridgeTransaction.create({
        data: {
          reference,
          userId,
          merchantId,
          apiKeyId,
          fromChain,
          toChain,
          amount,
          sourceAddress: sourceAddress || 'PENDING_FROM_CLIENT',
          destinationAddress: destinationAddress || 'PENDING_FROM_CLIENT',
          offrampReference: dto.offrampReference ?? null,
          status: 'PENDING',
          metadata: {},
        },
      });

      // Link the off-ramp payout order to this bridge leg immediately so its
      // expiry is held while the transfer is in flight (not only at delivery).
      await this.linkOfframpOrder(reference, dto.offrampReference);

      // Wallet-signed clients create the record first, then execute the
      // bridge themselves and report step hashes via /bridge/update-hash.
      // This avoids double-execution with the service signing key.
      if (dto.recordOnly) {
        this.logger.log(
          `Bridge transfer record created (record-only): ${reference}`,
        );
        return {
          reference,
          status: bridgeTransaction.status,
          fromChain,
          toChain,
          amount,
          sourceTxHash: null,
          destinationTxHash: null,
          transactionHash: bridgeTransaction.transactionHash,
        };
      }

      const kit = this.getBridgeKit();
      const sourceAdapter = this.sourceAdapterInstance;

      const params: BridgeParams = {
        from: {
          adapter: sourceAdapter,
          chain: fromChain as BridgeChainIdentifier,
        },
        to: {
          adapter: sourceAdapter,
          chain: toChain as BridgeChainIdentifier,
          ...(destinationAddress ? { recipientAddress: destinationAddress } : {}),
        },
        amount,
        config: { transferSpeed: this.transferSpeed },
      };

      const result: BridgeResult<string> = await kit.bridge(params);

      const sourceTxHash =
        result.steps.find((s) => s.name === 'depositForBurn')?.txHash ??
        result.steps.find((s) => s.name === 'burn')?.txHash ??
        null;

      const destinationTxHash =
        result.steps.find((s) => s.name === 'mint')?.txHash ?? null;

      const status =
        result.state === 'success'
          ? 'COMPLETED'
          : result.state === 'error'
            ? 'FAILED'
            : 'PENDING';

      if (result.state === 'error') {
        this.logger.error(`Bridge transfer ${reference} failed`, {
          failedSteps: result.steps.filter((s) => s.state === 'error'),
        });
      }

      const updated = await this.prisma.bridgeTransaction.update({
        where: { reference },
        data: {
          status,
          transactionHash: destinationTxHash ?? sourceTxHash ?? null,
          metadata: {
            ...((bridgeTransaction.metadata as Record<string, any>) || {}),
            sourceTxHash,
            destinationTxHash,
            sourceAddress: result.source.address,
            destinationAddress: result.destination.address,
            destinationChain: result.destination.chain.name,
            useForwarder: !!result.destination.useForwarder,
          },
        },
      });

      this.logger.log(`Bridge transfer executed: ${reference} (${status})`);

      return {
        reference,
        status,
        fromChain,
        toChain,
        amount,
        sourceTxHash,
        destinationTxHash,
        transactionHash: updated.transactionHash,
      };
    } catch (error) {
      this.logger.error('Failed to initiate bridge transfer:', error);
      throw new BadRequestException(
        `Failed to initiate bridge: ${error.message}`,
      );
    }
  }

  /**
   * Link a bridge leg to the off-ramp payout order it funds so the order's
   * payout expiry is held while the transfer is in flight. Best-effort: a
   * missing order is logged, not fatal, so bridging never blocks on it.
   */
  private async linkOfframpOrder(
    bridgeReference: string,
    offrampReference?: string | null,
  ): Promise<void> {
    if (!offrampReference) return;

    const order = await this.prisma.offrampProviderOrder.findUnique({
      where: { reference: offrampReference },
    });

    if (!order) {
      this.logger.warn(
        `[bridge] off-ramp link skipped: order ${offrampReference} not found for ${bridgeReference}`,
      );
      return;
    }

    await this.prisma.offrampProviderOrder.update({
      where: { id: order.id },
      data: { bridgeReference, bridgeStatus: 'PENDING' },
    });
  }

  /**
   * Mirror a bridge status change onto the linked off-ramp order (best effort).
   * `COMPLETED` is normalized to `SUCCESS` for the funding mirror.
   */
  async mirrorBridgeStatusToOfframp(
    offrampReference: string | null,
    status: string,
    opts: { depositTxHash?: string | null } = {},
  ): Promise<void> {
    if (!offrampReference) return;

    const order = await this.prisma.offrampProviderOrder.findUnique({
      where: { reference: offrampReference },
    });
    if (!order) {
      this.logger.warn(
        `[bridge] funding mirror skipped: off-ramp order ${offrampReference} not found`,
      );
      return;
    }

    const normalized = status === 'COMPLETED' ? 'SUCCESS' : status;
    await this.prisma.offrampProviderOrder.update({
      where: { id: order.id },
      data: {
        bridgeStatus: normalized,
        ...(normalized === 'SUCCESS' && opts.depositTxHash
          ? { depositTxHash: opts.depositTxHash }
          : {}),
      },
    });
  }

  /**
   * Update bridge transaction with hash from client
   */
  async updateBridgeStatus(
    reference: string,
    hash: string,
    step: string,
    status: string = 'PROCESSING',
    metadata: any = {},
  ) {
    const transaction = await this.prisma.bridgeTransaction.findUnique({
      where: { reference },
    });

    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    const currentMetadata = (transaction.metadata as any) || {};
    const updatedMetadata = {
      ...currentMetadata,
      [step]: hash,
      ...metadata,
    };

    // Use specific hash field for the source transaction hash
    const updateData: any = {
      status: normalizeBridgeStatus(status),
      metadata: updatedMetadata,
      updatedAt: new Date(),
    };

    if (step === 'SOURCE_TX') {
      updateData.transactionHash = hash;
    }

    const updated = await this.prisma.bridgeTransaction.update({
      where: { reference },
      data: updateData,
    });

    // Keep the linked off-ramp funding order in sync. The destination hash is
    // the on-chain proof the funding USDC was delivered on Stellar.
    if (
      transaction.offrampReference &&
      (step === 'DESTINATION_TX' || status !== 'PROCESSING')
    ) {
      await this.mirrorBridgeStatusToOfframp(
        transaction.offrampReference,
        status,
        {
          depositTxHash: step === 'DESTINATION_TX' ? hash : null,
        },
      );
    }

    return updated;
  }

  /**
   * Confirm a cross-chain bridge delivery that funds an offramp payout.
   *
   * Marks the bridge leg delivered (DESTINATION_TX success) and mirrors the
   * funding state onto the offramp provider order so the payout moves past
   * PENDING and the expiry sweep no longer treats it as unfunded.
   */
  async confirmDelivery(input: BridgeDeliveryInput): Promise<{
    bridge: any;
    offramp: any;
  }> {
    const bridgeTx = await this.prisma.bridgeTransaction.findUnique({
      where: { reference: input.reference },
    });

    if (!bridgeTx) {
      throw new BadRequestException('Transfer not found');
    }

    const newStatus = input.status ?? 'SUCCESS';

    if (!KNOWN_DELIVERY_STATUSES.includes(newStatus)) {
      throw new BadRequestException(`Unknown delivery status: ${newStatus}`);
    }

    // Idempotency guard: a terminal outcome may not regress. SUCCESS is the
    // one exception so a late successful delivery can still be mirrored over
    // an earlier failure (recovery case: FAILED -> SUCCESS).
    const bridgeStatus = normalizeBridgeStatus(newStatus);
    if (
      normalizeBridgeStatus(bridgeTx.status) !== 'PENDING' &&
      bridgeStatus !== 'COMPLETED'
    ) {
      this.logger.warn(
        `[bridge] delivery ${input.reference} already terminal as ${bridgeTx.status}; ignoring ${newStatus}`,
      );
      return { bridge: bridgeTx, offramp: null };
    }

    this.logger.log(
      JSON.stringify({
        event: 'bridge_delivery_confirmed',
        bridgeReference: input.reference,
        offrampOrderReference: input.oframpFundingReference,
        status: newStatus,
        destinationTxHash: input.destinationTxHash ?? null,
        amount: input.amount ?? null,
      }),
    );

    const metadata = {
      ...((bridgeTx.metadata as Record<string, any>) || {}),
      delivery: {
        destinationTxHash: input.destinationTxHash ?? null,
        status: bridgeStatus,
        confirmedAt: new Date().toISOString(),
      },
    };

    const bridge = await this.prisma.bridgeTransaction.update({
      where: { reference: input.reference },
      data: {
        status: bridgeStatus,
        transactionHash: input.destinationTxHash ?? bridgeTx.transactionHash,
        metadata,
        offrampReference: input.oframpFundingReference,
      },
    });

    const offramp = await this.prisma.offrampProviderOrder.findUnique({
      where: { reference: input.oframpFundingReference },
    });

    let updatedOrder: any = null;
    if (offramp) {
      updatedOrder = await this.prisma.offrampProviderOrder.update({
        where: { id: offramp.id },
        data: {
          bridgeReference: bridge.reference,
          bridgeStatus: newStatus,
          receivedAmount: input.amount ?? bridgeTx.amount,
          depositTxHash: input.destinationTxHash ?? offramp.depositTxHash,
        },
      });
    } else {
      this.logger.warn(
        `[bridge] funding mirror skipped: offramp order ${input.oframpFundingReference} not found for delivery ${bridge.reference}`,
      );
    }

    return { bridge, offramp: updatedOrder };
  }

  /**
   * Get list of supported chains
   */
  getSupportedChains() {
    return {
      chains: this.supportedChains,
    };
  }

  /**
   * Check transfer status
   */
  async checkTransferStatus(reference: string) {
    const transaction = await this.prisma.bridgeTransaction.findUnique({
      where: { reference },
    });

    if (!transaction) {
      throw new BadRequestException('Transfer not found');
    }

    // In production, you'd check the actual blockchain status
    // and update the database accordingly
    return {
      reference: transaction.reference,
      status: normalizeBridgeStatus(transaction.status),
      fromChain: transaction.fromChain,
      toChain: transaction.toChain,
      amount: transaction.amount,
      sourceAddress: transaction.sourceAddress,
      destinationAddress: transaction.destinationAddress,
      transactionHash: transaction.transactionHash,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      metadata: transaction.metadata,
    };
  }

  /**
   * Get transfer history for a user or merchant
   */
  async getTransferHistory(userId?: string, merchantId?: string) {
    const where: any = {};

    if (userId) where.userId = userId;
    if (merchantId) where.merchantId = merchantId;

    const transactions = await this.prisma.bridgeTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      total: transactions.length,
      transactions: transactions.map((tx) => ({
        reference: tx.reference,
        status: normalizeBridgeStatus(tx.status),
        fromChain: tx.fromChain,
        toChain: tx.toChain,
        amount: tx.amount,
        transactionHash: tx.transactionHash,
        createdAt: tx.createdAt,
      })),
    };
  }
}
