import { payoutOrdersOver } from './testing/payout-orders-double';
import { NotFoundException } from '@nestjs/common';
import { PaymentCheckService } from './payment-check.service';

function build() {
  const prisma: any = {
    onrampTransaction: { findFirst: jest.fn(), findUnique: jest.fn() },
    merchantOnrampTransaction: { findFirst: jest.fn() },
    offrampTransaction: { findFirst: jest.fn(), findUnique: jest.fn() },
    merchantOfframpTransaction: { findFirst: jest.fn(), findUnique: jest.fn() },
    offrampProviderOrder: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const safehaven: any = { getTransfers: jest.fn() };
  const bitnob: any = { getPayoutByReference: jest.fn() };
  const bitnobWebhooks: any = { processWebhook: jest.fn() };
  const offrampSettlement: any = { settleCredit: jest.fn() };
  const onrampSettlement: any = { settleCredit: jest.fn() };
  const stellarRelay: any = { relay: jest.fn() };
  const svc = new PaymentCheckService(prisma, safehaven, bitnob, bitnobWebhooks, offrampSettlement, onrampSettlement, payoutOrdersOver(prisma), stellarRelay);
  return { svc, prisma, safehaven, bitnob, bitnobWebhooks, offrampSettlement, onrampSettlement, stellarRelay };
}

const onrampTx = { id: 't1', reference: 'on_1', status: 'PENDING', metadata: { safehaven: { accountNumber: '6012' } } };
const credit = (over: any = {}) => ({
  creditAccountNumber: '6012', status: 'Completed', amount: 2000, paymentReference: 'p1', ...over,
});

describe('PaymentCheckService', () => {
  describe('on-ramp', () => {
    it('settles the order when SafeHaven shows a completed credit to its deposit account', async () => {
      const { svc, prisma, safehaven, onrampSettlement } = build();
      prisma.onrampTransaction.findFirst.mockResolvedValue(onrampTx);
      prisma.onrampTransaction.findUnique.mockResolvedValue({ status: 'PROCESSING' });
      safehaven.getTransfers.mockResolvedValue({ data: [credit()] });
      onrampSettlement.settleCredit.mockResolvedValue({ status: 'success' });

      const res = await svc.check('onramp', 'on_1', 'u1', false);

      expect(onrampSettlement.settleCredit).toHaveBeenCalledWith(onrampTx, { amount: 2000 });
      expect(res).toMatchObject({ progressed: true, status: 'PROCESSING' });
    });

    it('reports nothing yet when no matching credit exists, and never settles', async () => {
      const { svc, prisma, safehaven, onrampSettlement } = build();
      prisma.onrampTransaction.findFirst.mockResolvedValue(onrampTx);
      safehaven.getTransfers.mockResolvedValue({
        data: [credit({ creditAccountNumber: '9999' }), credit({ status: 'Pending' }), credit({ amount: 0 })],
      });
      const res = await svc.check('onramp', 'on_1', 'u1', false);
      expect(res.progressed).toBe(false);
      expect(onrampSettlement.settleCredit).not.toHaveBeenCalled();
    });

    it('does not fail when the SafeHaven lookup errors', async () => {
      const { svc, prisma, safehaven } = build();
      prisma.onrampTransaction.findFirst.mockResolvedValue(onrampTx);
      safehaven.getTransfers.mockRejectedValue(new Error('boom'));
      await expect(svc.check('onramp', 'on_1', 'u1', false)).resolves.toMatchObject({ progressed: false });
    });

    it('does nothing for orders that are no longer PENDING', async () => {
      const { svc, prisma, safehaven } = build();
      prisma.onrampTransaction.findFirst.mockResolvedValue({ ...onrampTx, status: 'COMPLETED' });
      const res = await svc.check('onramp', 'on_1', 'u1', false);
      expect(res.status).toBe('COMPLETED');
      expect(safehaven.getTransfers).not.toHaveBeenCalled();
    });

    it("404s for someone else's order", async () => {
      const { svc, prisma } = build();
      prisma.onrampTransaction.findFirst.mockResolvedValue(null);
      await expect(svc.check('onramp', 'on_1', 'u2', false)).rejects.toThrow(NotFoundException);
    });
  });

  describe('off-ramp', () => {
    const offTx = { id: 'o1', reference: 'off_1', status: 'AWAITING_DEPOSIT', metadata: { safehaven: { accountNumber: '777' } } };

    it('feeds the Bitnob payout state through the webhook handler', async () => {
      const { svc, prisma, bitnob, bitnobWebhooks, safehaven } = build();
      prisma.offrampTransaction.findFirst.mockResolvedValue(offTx);
      prisma.offrampTransaction.findUnique.mockResolvedValue({ status: 'PROCESSING' });
      prisma.offrampProviderOrder.findUnique.mockResolvedValue({ providerOrderId: '3f0a9c2e-1b6d-4c7e-9a10-5d2f8e7b6a41' });
      bitnob.getPayoutByReference.mockResolvedValue({ data: { id: '3f0a9c2e-1b6d-4c7e-9a10-5d2f8e7b6a41', reference: 'off_1', status: 'PROCESSING' } });
      bitnobWebhooks.processWebhook.mockResolvedValue({ status: 'success' });
      safehaven.getTransfers.mockResolvedValue({ data: [] });

      const res = await svc.check('offramp', 'off_1', 'u1', false);

      expect(bitnobWebhooks.processWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'payouts.processing' }),
      );
      expect(res).toMatchObject({ progressed: true, status: 'PROCESSING' });
    });

    it('forwards the NGN when SafeHaven shows the collection account was credited', async () => {
      const { svc, prisma, safehaven, offrampSettlement } = build();
      prisma.offrampTransaction.findFirst.mockResolvedValue({ ...offTx, status: 'PAYOUT_PENDING' });
      prisma.offrampTransaction.findUnique.mockResolvedValue({ ...offTx, status: 'COMPLETED' });
      safehaven.getTransfers.mockResolvedValue({ data: [credit({ creditAccountNumber: '777', amount: 5000 })] });
      offrampSettlement.settleCredit.mockResolvedValue({ status: 'success' });

      const res = await svc.check('offramp', 'off_1', 'u1', false);

      expect(offrampSettlement.settleCredit).toHaveBeenCalledWith(expect.anything(), { amount: 5000 });
      expect(res.progressed).toBe(true);
    });

    it('is a no-op for terminal orders', async () => {
      const { svc, prisma, bitnob } = build();
      prisma.offrampTransaction.findFirst.mockResolvedValue({ ...offTx, status: 'COMPLETED' });
      const res = await svc.check('offramp', 'off_1', 'u1', false);
      expect(res.status).toBe('COMPLETED');
      expect(bitnob.getPayoutByReference).not.toHaveBeenCalled();
    });
  });
});
