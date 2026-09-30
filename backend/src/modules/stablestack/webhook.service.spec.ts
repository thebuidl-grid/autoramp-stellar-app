import { Test, TestingModule } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import { WebhookService } from './webhook.service';
import { PrismaService } from '../../database/prisma.service';
import { SwapGateway } from '../swap/swap.gateway';
import { StellarService } from '../stellar/stellar.service';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { CorridorService } from '../corridor/corridor.service';
import { OnrampDeliveryService } from './onramp-delivery.service';
import { ConfigService } from '@nestjs/config';

const cngnIssuer = Keypair.random().publicKey();
process.env.CNGN_ISSUER_PUBLIC_KEY = cngnIssuer;
process.env.USDC_ISSUER_PUBLIC_KEY = Keypair.random().publicKey();

const ngnCorridor = {
  id: 'corridor-ng',
  countryCode: 'NG',
  fiatCurrency: 'NGN',
  stablecoinCode: 'CNGN',
  stablecoinIssuer: cngnIssuer,
  rampProcessorProvider: 'flint',
  isActive: true,
};

describe('WebhookService', () => {
  let service: WebhookService;
  let prisma: {
    onrampTransaction: { findFirst: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    offrampTransaction: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    swapTransaction: { findUnique: jest.Mock; update: jest.Mock };
    webhookEvent: { create: jest.Mock };
    transactionLog: { create: jest.Mock };
  };
  let swapGateway: { emitTransactionUpdate: jest.Mock };
  let stellarService: { sendFromDistribution: jest.Mock };
  let rampProcessor: { verifyStatus?: jest.Mock };
  let rampProcessorRegistry: { get: jest.Mock };
  let corridorService: { findByStablecoinCode: jest.Mock };
  let onrampDeliveryService: { deliverOnramp: jest.Mock };

  beforeEach(async () => {
    prisma = {
      onrampTransaction: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      offrampTransaction: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      swapTransaction: { findUnique: jest.fn(), update: jest.fn() },
      webhookEvent: { create: jest.fn() },
      transactionLog: { create: jest.fn() },
    };
    swapGateway = { emitTransactionUpdate: jest.fn() };
    stellarService = { sendFromDistribution: jest.fn() };
    rampProcessor = { verifyStatus: jest.fn() };
    rampProcessorRegistry = { get: jest.fn().mockReturnValue(rampProcessor) };
    corridorService = { findByStablecoinCode: jest.fn().mockResolvedValue(ngnCorridor) };
    onrampDeliveryService = { deliverOnramp: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: SwapGateway, useValue: swapGateway },
        { provide: StellarService, useValue: stellarService },
        { provide: RampProcessorRegistry, useValue: rampProcessorRegistry },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: CorridorService, useValue: corridorService },
        { provide: OnrampDeliveryService, useValue: onrampDeliveryService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  describe('onramp completion', () => {
    const destination = Keypair.random().publicKey();

    it('mints CNGN from the distribution account when an onramp completes', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'PENDING',
        amount: 10000,
        destinationAddress: destination,
        userId: 'user-1',
        metadata: null,
      });
      stellarService.sendFromDistribution.mockResolvedValue('mintTxHash');
      prisma.onrampTransaction.update.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'COMPLETED',
      });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processWebhook({
        event: 'onramp.completed',
        data: { reference: 'txn_ref_onramp', status: 'completed' },
      } as any);

      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '10000', destination }),
      );
      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            metadata: expect.objectContaining({ mintTransactionHash: 'mintTxHash' }),
          }),
        }),
      );
      expect(swapGateway.emitTransactionUpdate).toHaveBeenCalledWith(
        'txn_ref_onramp',
        expect.objectContaining({ type: 'onramp', status: 'COMPLETED' }),
      );
    });

    it('does not mint again if already minted (idempotency)', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'COMPLETED',
        amount: 10000,
        destinationAddress: destination,
        userId: 'user-1',
        metadata: { mintTransactionHash: 'alreadyMinted' },
      });
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_onramp' });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processWebhook({
        event: 'onramp.completed',
        data: { reference: 'txn_ref_onramp', status: 'completed' },
      } as any);

      expect(stellarService.sendFromDistribution).not.toHaveBeenCalled();
    });

    it('does not mint for a non-completed status update', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'PENDING',
        amount: 10000,
        destinationAddress: destination,
        userId: 'user-1',
        metadata: null,
      });
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_onramp' });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processWebhook({
        event: 'onramp.processing',
        data: { reference: 'txn_ref_onramp', status: 'processing' },
      } as any);

      expect(stellarService.sendFromDistribution).not.toHaveBeenCalled();
    });

    it('caps the mint at the onramp amount when processedAmount claims more', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'PENDING',
        amount: 10000,
        destinationAddress: destination,
        userId: 'user-1',
        metadata: null,
      });
      stellarService.sendFromDistribution.mockResolvedValue('mintTxHash');
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_onramp' });

      await service.processWebhook({
        event: 'onramp.completed',
        data: { reference: 'txn_ref_onramp', status: 'completed', processedAmount: 1000000 },
      } as any);

      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '10000', destination }),
      );
    });

    it('mints only the processed amount on a short payment', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'PENDING',
        amount: 10000,
        destinationAddress: destination,
        userId: 'user-1',
        metadata: null,
      });
      stellarService.sendFromDistribution.mockResolvedValue('mintTxHash');
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_onramp' });

      await service.processWebhook({
        event: 'onramp.completed',
        data: { reference: 'txn_ref_onramp', status: 'completed', processedAmount: 2500 },
      } as any);

      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '2500', destination }),
      );
    });

    it('ignores a Flint webhook for a transaction whose corridor uses a different processor', async () => {
      corridorService.findByStablecoinCode.mockResolvedValue({ ...ngnCorridor, rampProcessorProvider: 'safehaven' });
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'PENDING',
        amount: 10000,
        tokenType: 'CNGN',
        destinationAddress: destination,
        userId: 'user-1',
        metadata: null,
      });

      const result = await service.processWebhook({
        event: 'onramp.completed',
        data: { reference: 'txn_ref_onramp', status: 'completed' },
      } as any);

      expect(result).toEqual(expect.objectContaining({ ignored: true }));
      expect(stellarService.sendFromDistribution).not.toHaveBeenCalled();
      expect(prisma.onrampTransaction.update).not.toHaveBeenCalled();
    });

    it('delegates to OnrampDeliveryService instead of minting directly when payoutChain is not stellar', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'PENDING',
        amount: 10000,
        destinationAddress: '0x000000000000000000000000000000000000aa',
        userId: 'user-1',
        metadata: null,
        payoutChain: 'base',
        payoutTokenCode: null,
      });
      onrampDeliveryService.deliverOnramp.mockResolvedValue({ bridgeReference: 'bridge_ref_1' });
      prisma.onrampTransaction.update.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'COMPLETED',
      });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processWebhook({
        event: 'onramp.completed',
        data: { reference: 'txn_ref_onramp', status: 'completed' },
      } as any);

      expect(stellarService.sendFromDistribution).not.toHaveBeenCalled();
      expect(onrampDeliveryService.deliverOnramp).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', mintAmount: '10000', payoutChain: 'base', payoutTokenCode: null }),
      );
      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            metadata: expect.objectContaining({ bridgeReference: 'bridge_ref_1' }),
          }),
        }),
      );
    });

    it('delegates to OnrampDeliveryService instead of minting directly when payoutTokenCode differs from the corridor asset', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'PENDING',
        amount: 10000,
        destinationAddress: destination,
        userId: 'user-1',
        metadata: null,
        payoutChain: 'stellar',
        payoutTokenCode: 'BRZ',
      });
      onrampDeliveryService.deliverOnramp.mockResolvedValue({ mintTxHash: 'mintTxHash2' });
      prisma.onrampTransaction.update.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_onramp',
        status: 'COMPLETED',
      });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processWebhook({
        event: 'onramp.completed',
        data: { reference: 'txn_ref_onramp', status: 'completed' },
      } as any);

      expect(stellarService.sendFromDistribution).not.toHaveBeenCalled();
      expect(onrampDeliveryService.deliverOnramp).toHaveBeenCalledWith(
        expect.objectContaining({ payoutChain: 'stellar', payoutTokenCode: 'BRZ' }),
      );
      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: expect.objectContaining({ mintTransactionHash: 'mintTxHash2' }) }),
        }),
      );
    });
  });

  describe('offramp completion with a linked swap', () => {
    it('also completes the linked swap transaction when the offramp completes', async () => {
      prisma.offrampTransaction.findFirst.mockResolvedValue(null);
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'offramp-1',
        reference: 'txn_ref_offramp',
        status: 'PROCESSING',
        swapId: 'swap-1',
        userId: 'user-1',
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'offramp-1',
        reference: 'txn_ref_offramp',
        status: 'COMPLETED',
        swapId: 'swap-1',
      });
      prisma.swapTransaction.findUnique.mockResolvedValue({
        id: 'swap-1',
        reference: 'txn_ref_offramp',
        status: 'PROCESSING',
        userId: 'user-1',
      });
      prisma.swapTransaction.update.mockResolvedValue({});
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processWebhook({
        event: 'offramp.completed',
        data: { reference: 'txn_ref_offramp', status: 'completed' },
      } as any);

      expect(prisma.swapTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'swap-1' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(swapGateway.emitTransactionUpdate).toHaveBeenCalledWith(
        'txn_ref_offramp',
        expect.objectContaining({ type: 'swap', status: 'COMPLETED', swapId: 'swap-1' }),
      );
    });

    it('does not touch the swap if it is already COMPLETED', async () => {
      prisma.offrampTransaction.findFirst.mockResolvedValue(null);
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'offramp-1',
        reference: 'txn_ref_offramp',
        status: 'PROCESSING',
        swapId: 'swap-1',
        userId: 'user-1',
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'offramp-1',
        reference: 'txn_ref_offramp',
        status: 'COMPLETED',
        swapId: 'swap-1',
      });
      prisma.swapTransaction.findUnique.mockResolvedValue({ id: 'swap-1', status: 'COMPLETED' });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processWebhook({
        event: 'offramp.completed',
        data: { reference: 'txn_ref_offramp', status: 'completed' },
      } as any);

      expect(prisma.swapTransaction.update).not.toHaveBeenCalled();
    });
  });

  describe('processPaystackWebhook', () => {
    const destination = Keypair.random().publicKey();

    it('matches a DVA deposit (charge.success) to the PENDING onramp on that account and mints CNGN', async () => {
      prisma.onrampTransaction.findMany.mockResolvedValue([
        {
          id: 'onramp-1',
          reference: 'txn_ref_a',
          status: 'PENDING',
          amount: 10000,
          destinationAddress: destination,
          userId: 'user-1',
          metadata: null,
          depositAccount: { accountNumber: '9990001234' },
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'onramp-2',
          reference: 'txn_ref_b',
          status: 'PENDING',
          amount: 5000,
          destinationAddress: destination,
          userId: 'user-2',
          metadata: null,
          depositAccount: { accountNumber: '9990009999' },
          createdAt: new Date('2026-01-01'),
        },
      ]);
      stellarService.sendFromDistribution.mockResolvedValue('mintHashPaystack');
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_a' });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processPaystackWebhook({
        event: 'charge.success',
        data: { channel: 'dedicated_nuban', receiver_account_number: '9990001234', amount: 1000000 },
      });

      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ destination, amount: '10000' }),
      );
      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'onramp-1' } }),
      );
    });

    it('matches an M-Pesa charge (charge.success, mobile_money) to the PENDING onramp by reference and mints CKES', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue({
        id: 'onramp-kes-1',
        reference: 'txn_ref_kes',
        status: 'PENDING',
        amount: 1000,
        destinationAddress: destination,
        userId: 'user-3',
        metadata: null,
        depositAccount: { collectionMethod: 'mobile_money_push' },
        createdAt: new Date('2026-01-01'),
      });
      stellarService.sendFromDistribution.mockResolvedValue('mintHashMpesa');
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-kes-1', reference: 'txn_ref_kes' });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processPaystackWebhook({
        event: 'charge.success',
        data: { channel: 'mobile_money', reference: 'txn_ref_kes', amount: 100000 },
      });

      expect(prisma.onrampTransaction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reference: 'txn_ref_kes', status: 'PENDING' } }),
      );
      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'onramp-kes-1' } }),
      );
    });

    it('throws when no PENDING onramp matches an M-Pesa charge reference', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.processPaystackWebhook({
          event: 'charge.success',
          data: { channel: 'mobile_money', reference: 'unknown_ref' },
        }),
      ).rejects.toThrow('No PENDING onramp found');
    });

    it('throws when no PENDING onramp matches the deposit account number', async () => {
      prisma.onrampTransaction.findMany.mockResolvedValue([]);

      await expect(
        service.processPaystackWebhook({
          event: 'charge.success',
          data: { channel: 'dedicated_nuban', receiver_account_number: 'unknown', amount: 1000 },
        }),
      ).rejects.toThrow('No PENDING onramp found');
    });

    it('matches transfer.success to the offramp by transfer_code (stored in flintTransactionId) and completes it', async () => {
      prisma.offrampTransaction.findFirst.mockResolvedValue({
        id: 'offramp-1',
        reference: 'txn_ref_off',
        status: 'PROCESSING',
        swapId: null,
        userId: 'user-1',
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'offramp-1',
        reference: 'txn_ref_off',
        status: 'COMPLETED',
        swapId: null,
      });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processPaystackWebhook({
        event: 'transfer.success',
        data: { transfer_code: 'TRF_456', amount: 500000 },
      });

      expect(prisma.offrampTransaction.findFirst).toHaveBeenCalledWith({
        where: { flintTransactionId: 'TRF_456' },
      });
      expect(prisma.offrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });

    it('maps transfer.failed to FAILED', async () => {
      prisma.offrampTransaction.findFirst.mockResolvedValue({
        id: 'offramp-2',
        reference: 'txn_ref_off2',
        status: 'PROCESSING',
        swapId: null,
        userId: 'user-1',
      });
      prisma.offrampTransaction.update.mockResolvedValue({ status: 'FAILED' });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processPaystackWebhook({
        event: 'transfer.failed',
        data: { transfer_code: 'TRF_789' },
      });

      expect(prisma.offrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('ignores unhandled event types instead of throwing', async () => {
      const result = await service.processPaystackWebhook({ event: 'customer.created', data: {} });
      expect(result).toEqual({ ignored: true, event: 'customer.created' });
    });
  });

  describe('processSafeHavenWebhook', () => {
    const destination = Keypair.random().publicKey();

    it('ignores the webhook when the active RampProcessor is not SafeHaven', async () => {
      rampProcessor.verifyStatus = undefined;

      const result = await service.processSafeHavenWebhook({ data: { sessionId: 'sess-1' } });

      expect(result).toEqual({ ignored: true });
    });

    it('ignores the webhook when it has no sessionId or paymentReference', async () => {
      const result = await service.processSafeHavenWebhook({ data: {} });
      expect(result).toEqual({ ignored: true, reason: 'missing identifiers' });
      expect(rampProcessor.verifyStatus).not.toHaveBeenCalled();
    });

    it('re-verifies via the processor and completes a matching onramp', async () => {
      rampProcessor.verifyStatus!.mockResolvedValue({
        kind: 'onramp',
        reference: 'txn_ref_sh_on',
        completed: true,
        failed: false,
        raw: {},
      });
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'onramp-sh-1',
        reference: 'txn_ref_sh_on',
        status: 'PENDING',
        amount: 10000,
        destinationAddress: destination,
        userId: 'user-1',
        metadata: null,
      });
      stellarService.sendFromDistribution.mockResolvedValue('mintHashSafeHaven');
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-sh-1', reference: 'txn_ref_sh_on' });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processSafeHavenWebhook({ data: { sessionId: 'sess-on-1' } });

      expect(rampProcessor.verifyStatus).toHaveBeenCalledWith({ sessionId: 'sess-on-1', paymentReference: undefined });
      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ destination, amount: '10000' }),
      );
    });

    it('re-verifies via the processor and completes a matching offramp', async () => {
      rampProcessor.verifyStatus!.mockResolvedValue({
        kind: 'offramp',
        reference: 'txn_ref_sh_off',
        completed: true,
        failed: false,
        raw: {},
      });
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'offramp-sh-1',
        reference: 'txn_ref_sh_off',
        status: 'PROCESSING',
        swapId: null,
        userId: 'user-1',
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'offramp-sh-1',
        reference: 'txn_ref_sh_off',
        status: 'COMPLETED',
        swapId: null,
      });
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      await service.processSafeHavenWebhook({ data: { paymentReference: 'txn_ref_sh_off' } });

      expect(prisma.offrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });

    it('throws when verifyStatus resolves a reference with no matching onramp', async () => {
      rampProcessor.verifyStatus!.mockResolvedValue({
        kind: 'onramp',
        reference: 'txn_ref_missing',
        completed: true,
        failed: false,
        raw: {},
      });
      prisma.onrampTransaction.findUnique.mockResolvedValue(null);

      await expect(
        service.processSafeHavenWebhook({ data: { sessionId: 'sess-missing' } }),
      ).rejects.toThrow('No onramp found for SafeHaven reference txn_ref_missing');
    });

    it('ignores when verifyStatus finds nothing authoritative', async () => {
      rampProcessor.verifyStatus!.mockResolvedValue(null);

      const result = await service.processSafeHavenWebhook({ data: { sessionId: 'sess-unknown' } });

      expect(result).toEqual({ ignored: true });
    });
  });

  describe('error handling', () => {
    it('throws NotFoundException when no matching transaction exists', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue(null);
      prisma.offrampTransaction.findFirst.mockResolvedValue(null);
      prisma.offrampTransaction.findUnique.mockResolvedValue(null);
      prisma.webhookEvent.create.mockResolvedValue({});

      await expect(
        service.processWebhook({
          event: 'onramp.completed',
          data: { reference: 'nonexistent', status: 'completed' },
        } as any),
      ).rejects.toThrow('Transaction not found');
    });

    it('does not attempt to log a webhookEvent row when no transaction was ever resolved (would violate the UUID column)', async () => {
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      prisma.onrampTransaction.findUnique.mockResolvedValue(null);
      prisma.offrampTransaction.findFirst.mockResolvedValue(null);
      prisma.offrampTransaction.findUnique.mockResolvedValue(null);

      await expect(
        service.processWebhook({
          event: 'onramp.completed',
          data: { reference: 'nonexistent', status: 'completed' },
        } as any),
      ).rejects.toThrow('Transaction not found');

      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });
  });
});
