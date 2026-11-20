import { payoutOrdersOver } from './testing/payout-orders-double';
import { RampService } from './ramp.service';

const STELLAR_ADDR = 'G' + 'A'.repeat(55);
const BASE_ADDR = '0x' + '22'.repeat(20);

function build({ relayEnabled = true }: { relayEnabled?: boolean } = {}) {
  const bitnob: any = {
    destinationTypeFor: jest.fn().mockResolvedValue('bank'),
    accountLookup: jest
      .fn()
      .mockResolvedValue({ data: { account_name: 'ANDREW DAVID' } }),
    createPayoutQuote: jest
      .fn()
      .mockResolvedValue({ data: { id: 'QT2_1', payout: { id: 'QT2_1' } } }),
    initializePayout: jest.fn().mockResolvedValue({
      data: {
        payment_address: BASE_ADDR,
        amount_to_pay: '1.372977',
        expires_at: '2026-11-19T10:00:00Z',
      },
    }),
    getWebhookUrl: jest.fn().mockReturnValue(undefined),
    bitnobBankName: jest.fn().mockResolvedValue('Access Bank'),
  };
  const prisma: any = {
    offrampTransaction: {
      create: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({
          id: 't1',
          createdAt: new Date(),
          ...data,
        })),
    },
    merchantOfframpTransaction: {
      create: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({
          id: 'm1',
          createdAt: new Date(),
          ...data,
        })),
    },
    transactionLog: { create: jest.fn().mockResolvedValue({}) },
    offrampProviderOrder: { create: jest.fn().mockResolvedValue({}) },
  };
  const stellarRelay: any = {
    isEnabled: jest.fn().mockReturnValue(relayEnabled),
    resolveNetwork: jest.fn((n?: string) => (n === 'testnet' ? 'testnet' : 'mainnet')),
    planBurn: jest.fn().mockResolvedValue({
      burnAmountUnits: '13730000',
      burnAmount: '1.3730000',
      maxFeeUnits: '700',
      maxFee: '0.0000700',
      feeBps: 0.5,
    }),
    bridgeInstructions: jest
      .fn()
      .mockImplementation((to: string, plan: any, network: string) => ({
        via: 'cctp',
        network,
        mintRecipient: to,
        burnAmountUnits: plan.burnAmountUnits,
        maxFeeUnits: plan.maxFeeUnits,
      })),
  };
  const config: any = { get: jest.fn((k: string) => (k === 'RAMP_API_URL' || k === 'RAMP_API_KEY' ? 'x' : undefined)) };
  const offrampState: any = { recordInitiated: jest.fn(), apply: jest.fn() };
  const shSettlement: any = { isEnabledFor: jest.fn().mockReturnValue(false) };
  const svc = new RampService(
    {} as any,
    config,
    prisma,
    {} as any,
    {} as any,
    {} as any,
    bitnob,
    offrampState,
    payoutOrdersOver(prisma),
    shSettlement,
    {} as any,
    stellarRelay,
  );
  return { svc, bitnob, prisma, stellarRelay };
}

const dto = (network: string, sourceAddress: string): any => ({
  network,
  amount: 2000,
  sourceAddress,
  destination: { bankCode: '044', accountNumber: '0041535020' },
});

describe('RampService.offRamp: Stellar over CCTP + Base', () => {
  it('opens the Bitnob payout on BASE, hides the deposit address and returns burn instructions', async () => {
    const { svc, bitnob, prisma, stellarRelay } = build();
    const res = await svc.offRamp(
      'u1',
      'a@b.c',
      false,
      false,
      dto('stellar', STELLAR_ADDR),
    );

    expect(bitnob.createPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ chain: 'BASE' }),
    );
    expect(stellarRelay.planBurn).toHaveBeenCalledWith('1.372977', 'mainnet');
    expect(res.deposit).toMatchObject({
      network: 'stellar',
      mode: 'cctp_relay',
      amount: '1.3730000',
      sourceAddress: STELLAR_ADDR,
    });
    expect(res.deposit.receiveAddress).toBeUndefined();
    expect(res.bridge).toMatchObject({
      mintRecipient: BASE_ADDR,
      burnAmountUnits: '13730000',
    });
    // persisted so the relayer can verify the burn against this exact address
    expect(prisma.offrampTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          cctpRelay: expect.objectContaining({
            status: 'awaiting_burn',
            mintRecipient: BASE_ADDR,
            burnAmountUnits: '13730000',
          }),
        },
      }),
    });
    expect(prisma.offrampProviderOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fundingAddress: BASE_ADDR,
        sourceAddress: STELLAR_ADDR,
      }),
    });
  });

  it('keeps the direct Stellar payout when the relay is off', async () => {
    const { svc, bitnob, stellarRelay } = build({ relayEnabled: false });
    bitnob.initializePayout.mockResolvedValue({
      data: { payment_address: 'GDEST', amount_to_pay: '1.37', memo: '123' },
    });
    const res = await svc.offRamp(
      'u1',
      'a@b.c',
      false,
      false,
      dto('stellar', STELLAR_ADDR),
    );
    expect(bitnob.createPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ chain: 'STELLAR' }),
    );
    expect(stellarRelay.planBurn).not.toHaveBeenCalled();
    expect(res.deposit).toMatchObject({ receiveAddress: 'GDEST', memo: '123' });
    expect(res.bridge).toBeUndefined();
  });

  it("doesn't relay Base off-ramps", async () => {
    const { svc, bitnob, stellarRelay } = build();
    const res = await svc.offRamp(
      'u1',
      'a@b.c',
      false,
      false,
      dto('base', '0x' + '33'.repeat(20)),
    );
    expect(bitnob.createPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ chain: 'BASE' }),
    );
    expect(stellarRelay.planBurn).not.toHaveBeenCalled();
    expect(res.deposit.receiveAddress).toBe(BASE_ADDR);
    expect(res.bridge).toBeUndefined();
  });

  it("doesn't relay merchant Stellar off-ramps", async () => {
    const { svc, bitnob, stellarRelay } = build();
    await svc.offRamp('m1', 'a@b.c', true, false, dto('stellar', STELLAR_ADDR));
    expect(bitnob.createPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ chain: 'STELLAR' }),
    );
    expect(stellarRelay.planBurn).not.toHaveBeenCalled();
  });

  it('fails rather than expose a bad deposit when Bitnob returns no Base address', async () => {
    const { svc, bitnob } = build();
    bitnob.initializePayout.mockResolvedValue({
      data: { payment_address: 'GNOTEVM', amount_to_pay: '1.37' },
    });
    await expect(
      svc.offRamp('u1', 'a@b.c', false, false, dto('stellar', STELLAR_ADDR)),
    ).rejects.toThrow();
  });

  it("follows the client's network toggle for the relayed order", async () => {
    const { svc, prisma, stellarRelay } = build();
    const res = await svc.offRamp('u1', 'a@b.c', false, false, {
      ...dto('stellar', STELLAR_ADDR),
      chainNetwork: 'testnet',
    });
    expect(stellarRelay.planBurn).toHaveBeenCalledWith('1.372977', 'testnet');
    expect(res.bridge.network).toBe('testnet');
    expect(prisma.offrampTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { cctpRelay: expect.objectContaining({ network: 'testnet' }) },
      }),
    });
  });

  it('uses the server default (mainnet) when the client sends no network', async () => {
    const { svc, stellarRelay } = build();
    const res = await svc.offRamp('u1', 'a@b.c', false, false, dto('stellar', STELLAR_ADDR));
    expect(stellarRelay.planBurn).toHaveBeenCalledWith('1.372977', 'mainnet');
    expect(res.bridge.network).toBe('mainnet');
  });
});
