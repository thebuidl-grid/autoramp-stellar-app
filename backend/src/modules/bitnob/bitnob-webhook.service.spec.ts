import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { BitNobService } from './bitnob.service';
import { SwapGateway } from '../swap/swap.gateway';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { OfframpStateService } from '../ramp/offramp-state.service';
import {
  BitNobWebhookService,
  mapBitnobEvent,
  verifyBitnobSignature,
} from './bitnob-webhook.service';

describe('bitnob-webhook — pure helpers', () => {
  describe('verifyBitnobSignature', () => {
    const secret = 'test-secret';
    const rawBody = Buffer.from('{"event":"payout.settled"}');

    it('accepts a valid HMAC-SHA512 signature', () => {
      const signature = createHmac('sha512', secret).update(rawBody).digest('hex');
      expect(verifyBitnobSignature(rawBody, signature, secret)).toBe(true);
    });

    it('rejects a wrong signature', () => {
      expect(verifyBitnobSignature(rawBody, 'deadbeef', secret)).toBe(false);
    });

    it('rejects a signature computed with a different secret', () => {
      const signature = createHmac('sha512', 'wrong').update(rawBody).digest('hex');
      expect(verifyBitnobSignature(rawBody, signature, secret)).toBe(false);
    });

    it('rejects when body, signature, or secret is missing', () => {
      const signature = createHmac('sha512', secret).update(rawBody).digest('hex');
      expect(verifyBitnobSignature(null, signature, secret)).toBe(false);
      expect(verifyBitnobSignature(rawBody, null, secret)).toBe(false);
      expect(verifyBitnobSignature(rawBody, signature, null)).toBe(false);
    });
  });

  describe('mapBitnobEvent', () => {
    it.each([
      ['payout.created', 'PENDING'],
      ['payout.settled', 'COMPLETED'],
      ['payout.pending', 'PROCESSING'],
      ['payout.failed', 'FAILED'],
      ['payout.cancelled', 'CANCELLED'],
      ['withdrawal.completed', 'COMPLETED'],
      ['transfer.success', 'COMPLETED'],
      ['transfer.pending', 'PROCESSING'],
      ['transfer.failed', 'FAILED'],
    ])('maps %s to %s', (event, expected) => {
      expect(mapBitnobEvent(event)).toBe(expected);
    });

    it('returns null for unknown events', () => {
      expect(mapBitnobEvent('something.weird')).toBeNull();
      expect(mapBitnobEvent(undefined)).toBeNull();
    });
  });
});

describe('BitNobWebhookService', () => {
  let service: BitNobWebhookService;
  let prisma: any;
  let bitnobService: { tradingQuote: jest.Mock; tradingOrder: jest.Mock; createWithdrawal: jest.Mock };
  let swapGateway: { emitTransactionUpdate: jest.Mock };
  let notificationsService: { notifyMerchant: jest.Mock };
  let offrampState: { apply: jest.Mock; availableLiquidity: jest.Mock; beginPayout: jest.Mock };

  beforeEach(async () => {
    prisma = {
      offrampProviderOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      offrampTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      merchantOfframpTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      onrampTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      merchantOnrampTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      virtualAccount: { findFirst: jest.fn().mockResolvedValue(null) },
      webhookEvent: { create: jest.fn().mockResolvedValue({}) },
      transactionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    bitnobService = {
      tradingQuote: jest.fn(),
      tradingOrder: jest.fn(),
      createWithdrawal: jest.fn(),
    };
    swapGateway = { emitTransactionUpdate: jest.fn() };
    notificationsService = { notifyMerchant: jest.fn() };
    offrampState = {
      apply: jest.fn().mockResolvedValue({ outcome: 'APPLIED' }),
      availableLiquidity: jest.fn().mockReturnValue(undefined),
      beginPayout: jest.fn().mockResolvedValue({ outcome: 'APPLIED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitNobWebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: BitNobService, useValue: bitnobService },
        { provide: SwapGateway, useValue: swapGateway },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: OfframpStateService, useValue: offrampState },
      ],
    }).compile();

    service = module.get<BitNobWebhookService>(BitNobWebhookService);
  });

  describe('payout (off-ramp) routing', () => {
    it('updates the off-ramp transaction to COMPLETED on payout.settled', async () => {
      prisma.offrampProviderOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        reference: 'off_1',
        providerOrderId: 'payout-1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
      });
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'PENDING',
        metadata: {},
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'COMPLETED',
      });

      const result = await service.processWebhook({
        event: 'payout.settled',
        data: { id: 'payout-1', reference: 'off_1', status: 'settled' },
      });

      expect(result).toEqual({
        status: 'processed',
        reference: 'off_1',
        newStatus: 'COMPLETED',
      });
      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-1',
        'COMPLETED',
        expect.objectContaining({
          actor: 'bitnob-webhook',
          eventKey: 'bitnob:payout-1:payout.settled:settled:',
          providerStatus: 'payout.settled',
        }),
      );
      expect(swapGateway.emitTransactionUpdate).toHaveBeenCalled();
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });

    it('ignores an unknown payout order', async () => {
      const result = await service.processWebhook({
        event: 'payout.settled',
        data: { id: 'unknown', reference: 'nope' },
      });
      expect(result).toEqual({ status: 'ignored', reason: 'unknown_order' });
    });

    it('marks an under-paid deposit as PARTIALLY_SETTLED with reason partial_settlement', async () => {
      prisma.offrampProviderOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        reference: 'off_1',
        providerOrderId: 'payout-1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
        expectedAmount: 100.5,
      });
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'PENDING',
        metadata: {},
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'PARTIALLY_SETTLED',
      });

      const result = await service.processWebhook({
        event: 'payout.pending',
        data: {
          id: 'payout-1',
          reference: 'off_1',
          status: 'pending',
          received_amount: '50',
        },
      });

      expect(result.newStatus).toBe('PARTIALLY_SETTLED');
      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-1',
        'PARTIALLY_SETTLED',
        expect.objectContaining({ receivedAmount: '50', reason: 'partial_settlement' }),
      );
    });

    it('maps a liquidity failure to INSUFFICIENT_LIQUIDITY with reason insufficient_liquidity', async () => {
      prisma.offrampProviderOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        reference: 'off_1',
        providerOrderId: 'payout-1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
        expectedAmount: null,
      });
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'PROCESSING',
        metadata: {},
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'INSUFFICIENT_LIQUIDITY',
      });

      const result = await service.processWebhook({
        event: 'payout.failed',
        data: {
          id: 'payout-1',
          reference: 'off_1',
          status: 'failed',
          message: 'insufficient liquidity for payout',
        },
      });

      expect(result.newStatus).toBe('INSUFFICIENT_LIQUIDITY');
      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-1',
        'INSUFFICIENT_LIQUIDITY',
        expect.objectContaining({
          reason: 'insufficient_liquidity',
          detail: expect.objectContaining({ providerEvent: 'payout.failed' }),
        }),
      );
    });

    it('maps a rejected payout to REJECTED with reason rejected', async () => {
      prisma.offrampProviderOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        reference: 'off_1',
        providerOrderId: 'payout-1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
        expectedAmount: null,
      });
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'PROCESSING',
        metadata: {},
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'REJECTED',
      });

      const result = await service.processWebhook({
        event: 'payout.failed',
        data: {
          id: 'payout-1',
          reference: 'off_1',
          status: 'failed',
          message: 'payout rejected by provider',
        },
      });

      expect(result.newStatus).toBe('REJECTED');
      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-1',
        'REJECTED',
        expect.objectContaining({
          reason: 'rejected',
          detail: expect.objectContaining({ providerResponse: expect.objectContaining({ message: 'payout rejected by provider' }) }),
        }),
      );
    });

    it('maps a reversal event to REVERSED with reason reversal', async () => {
      prisma.offrampProviderOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        reference: 'off_1',
        providerOrderId: 'payout-1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
        expectedAmount: null,
      });
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'COMPLETED',
        metadata: {},
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'REVERSED',
      });

      const result = await service.processWebhook({
        event: 'payout.reversed',
        data: { id: 'payout-1', reference: 'off_1', status: 'reversed' },
      });

      expect(result.newStatus).toBe('REVERSED');
      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-1',
        'REVERSED',
        expect.objectContaining({ reason: 'reversal' }),
      );
    });

    it('captures the Stellar deposit tx hash from a payout deposit webhook', async () => {
      prisma.offrampProviderOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        reference: 'off_1',
        providerOrderId: 'payout-1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
        expectedAmount: null,
      });
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'PENDING',
        metadata: {},
      });
      prisma.offrampTransaction.update.mockResolvedValue({
        id: 'tx-1',
        reference: 'off_1',
        status: 'PROCESSING',
      });

      await service.processWebhook({
        event: 'payout.pending',
        data: {
          id: 'payout-1',
          reference: 'off_1',
          status: 'pending',
          transaction_hash:
            '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80',
        },
      });

      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-1',
        'PROCESSING',
        expect.objectContaining({
          txHash: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80',
        }),
      );
    });

    describe('state machine guards (D1)', () => {
      const orderAndTx = (status: string) => {
        prisma.offrampProviderOrder.findFirst.mockResolvedValue({
          id: 'po-1',
          reference: 'off_1',
          providerOrderId: 'payout-1',
          offrampTransactionId: 'tx-1',
          merchantOfframpTransactionId: null,
          expectedAmount: null,
        });
        prisma.offrampTransaction.findUnique.mockResolvedValue({ id: 'tx-1', reference: 'off_1', status, metadata: {} });
      };
      const settled = { event: 'payout.settled', data: { id: 'payout-1', reference: 'off_1', status: 'settled' } };

      it('acknowledges a duplicate provider event without touching the transaction', async () => {
        orderAndTx('COMPLETED');
        offrampState.apply.mockResolvedValue({ outcome: 'DUPLICATE' });
        const result = await service.processWebhook(settled);
        expect(result).toEqual({ status: 'ignored', reason: 'duplicate_event', event: 'payout.settled' });
        expect(prisma.offrampTransaction.update).not.toHaveBeenCalled();
        expect(swapGateway.emitTransactionUpdate).not.toHaveBeenCalled();
      });

      it('ignores an event that would be an invalid transition (e.g. a late event after EXPIRED)', async () => {
        orderAndTx('EXPIRED');
        offrampState.apply.mockResolvedValue({ outcome: 'REJECTED_TRANSITION' });
        const result = await service.processWebhook(settled);
        expect(result).toEqual({ status: 'ignored', reason: 'invalid_transition', event: 'payout.settled' });
        expect(prisma.offrampTransaction.update).not.toHaveBeenCalled();
      });

      it('gates the payout on simulated liquidity once processing starts (only when a limit is configured)', async () => {
        orderAndTx('DEPOSIT_DETECTED');
        offrampState.availableLiquidity.mockReturnValue('3');
        prisma.offrampTransaction.update.mockResolvedValue({ id: 'tx-1', reference: 'off_1', status: 'INSUFFICIENT_LIQUIDITY' });
        await service.processWebhook({ event: 'payout.processing', data: { id: 'payout-1', reference: 'off_1', status: 'processing' } });
        expect(offrampState.beginPayout).toHaveBeenCalledWith('tx-1', { actor: 'payout-gate' });
      });

      it('does not gate the payout when no liquidity limit is configured', async () => {
        orderAndTx('DEPOSIT_DETECTED');
        prisma.offrampTransaction.update.mockResolvedValue({ id: 'tx-1', reference: 'off_1', status: 'PROCESSING' });
        await service.processWebhook({ event: 'payout.processing', data: { id: 'payout-1', reference: 'off_1', status: 'processing' } });
        expect(offrampState.beginPayout).not.toHaveBeenCalled();
      });
    });
  });

  describe('withdrawal (on-ramp terminal) routing', () => {
    it('marks the on-ramp COMPLETED on transfer.success', async () => {
      prisma.onrampTransaction.findUnique.mockResolvedValue({
        id: 'tx-2',
        reference: 'ABC',
        status: 'PROCESSING',
        metadata: {},
      });
      prisma.onrampTransaction.update.mockResolvedValue({
        id: 'tx-2',
        reference: 'ABC',
        status: 'COMPLETED',
      });

      const result = await service.processWebhook({
        event: 'transfer.success',
        data: { reference: 'WDR_ABC' },
      });

      expect(result).toEqual({
        status: 'processed',
        reference: 'ABC',
        newStatus: 'COMPLETED',
      });
      expect(prisma.onrampTransaction.findUnique).toHaveBeenCalledWith({
        where: { reference: 'ABC' },
      });
      expect(swapGateway.emitTransactionUpdate).toHaveBeenCalled();
    });

    it('ignores an unknown withdrawal reference', async () => {
      prisma.onrampTransaction.findUnique.mockResolvedValue(null);
      const result = await service.processWebhook({
        event: 'transfer.success',
        data: { reference: 'WDR_MISSING' },
      });
      expect(result).toEqual({ status: 'ignored', reason: 'unknown_reference' });
    });
  });

  describe('deposit (on-ramp pipeline) routing', () => {
    it('runs the trading + withdrawal pipeline on a deposit webhook', async () => {
      prisma.virtualAccount.findFirst.mockResolvedValue({
        id: 'va-row',
        externalReference: 'va-1',
        transactionType: 'onramp',
        userId: 'u1',
        merchantId: null,
      });
      prisma.onrampTransaction.findFirst.mockResolvedValue({
        id: 'tx-3',
        reference: 'on_3',
        status: 'PENDING',
        destinationAddress: 'GDEST',
        metadata: {},
      });
      prisma.onrampTransaction.update.mockResolvedValue({
        id: 'tx-3',
        reference: 'on_3',
        status: 'PROCESSING',
      });
      bitnobService.tradingQuote.mockResolvedValue({
        data: { id: 'q1', price: 1500 },
      });
      bitnobService.tradingOrder.mockResolvedValue({
        data: { exchange: { receive_quantity: '6000000' } },
      });
      bitnobService.createWithdrawal.mockResolvedValue({ data: { transaction_id: 'w1' } });

      const result = await service.processWebhook({
        event: 'deposit.completed',
        data: { virtual_account_id: 'va-1', amount: 500000 },
      });

      expect(result).toEqual({ status: 'processed', reference: 'on_3' });
      expect(bitnobService.tradingQuote).toHaveBeenCalledWith({
        baseCurrency: 'NGN',
        quoteCurrency: 'USDC',
        side: 'sell',
        quantity: 5000,
      });
      expect(bitnobService.tradingOrder).toHaveBeenCalled();
      expect(bitnobService.createWithdrawal).toHaveBeenCalledWith(
        expect.objectContaining({ toAddress: 'GDEST', reference: 'WDR_on_3' }),
      );
    });

    it('ignores unknown virtual accounts', async () => {
      prisma.virtualAccount.findFirst.mockResolvedValue(null);
      const result = await service.processWebhook({
        event: 'deposit.completed',
        data: { virtual_account_id: 'nope' },
      });
      expect(result).toEqual({
        status: 'ignored',
        reason: 'unknown_virtual_account',
      });
    });
  });

  describe('unknown events', () => {
    it('is ignored', async () => {
      const result = await service.processWebhook({ event: 'trade.updated' });
      expect(result).toEqual({
        status: 'ignored',
        reason: 'unknown_event',
        event: 'trade.updated',
      });
    });
  });
});
