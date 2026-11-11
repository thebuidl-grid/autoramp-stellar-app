import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BridgeService } from './bridge.service';

describe('BridgeService.confirmDelivery', () => {
  let service: BridgeService;
  let prisma: any;

  const delivery = {
    reference: 'BRG-123-abc',
    oframpFundingReference: 'OFF-456',
    destinationTxHash: '0xdest-hashes',
    amount: '25.50',
  };

  beforeEach(async () => {
    prisma = {
      bridgeTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      offrampProviderOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BridgeService>(BridgeService);
  });

  it('throws BadRequestException when the bridge transfer does not exist', async () => {
    await expect(service.confirmDelivery(delivery)).rejects.toThrow(
      new BadRequestException('Transfer not found'),
    );
    expect(prisma.bridgeTransaction.update).not.toHaveBeenCalled();
    expect(prisma.offrampProviderOrder.update).not.toHaveBeenCalled();
  });

  it('marks the bridge delivered and mirrors funding state onto the offramp order', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      id: 'bt-1',
      reference: 'BRG-123-abc',
      amount: '25.50',
      transactionHash: '0xsource',
      metadata: {},
    });
    prisma.bridgeTransaction.update.mockResolvedValue({
      id: 'bt-1',
      reference: 'BRG-123-abc',
      status: 'SUCCESS',
      offrampReference: 'OFF-456',
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue({
      id: 'po-1',
      reference: 'OFF-456',
    });
    prisma.offrampProviderOrder.update.mockResolvedValue({
      id: 'po-1',
      bridgeReference: 'BRG-123-abc',
      bridgeStatus: 'SUCCESS',
    });

    const result = await service.confirmDelivery(delivery);

    expect(prisma.bridgeTransaction.update).toHaveBeenCalledWith({
      where: { reference: 'BRG-123-abc' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        transactionHash: '0xdest-hashes',
        offrampReference: 'OFF-456',
        metadata: expect.objectContaining({
          delivery: expect.objectContaining({
            destinationTxHash: '0xdest-hashes',
            status: 'COMPLETED',
          }),
        }),
      }),
    });
    expect(prisma.offrampProviderOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: expect.objectContaining({
        bridgeReference: 'BRG-123-abc',
        bridgeStatus: 'SUCCESS',
        receivedAmount: '25.50',
        depositTxHash: '0xdest-hashes',
      }),
    });
    expect(result.bridge).toEqual({
      id: 'bt-1',
      reference: 'BRG-123-abc',
      status: 'SUCCESS',
      offrampReference: 'OFF-456',
    });
    expect(result.offramp).toEqual({
      id: 'po-1',
      bridgeReference: 'BRG-123-abc',
      bridgeStatus: 'SUCCESS',
    });
  });

  it('keeps the existing bridge hash when no destinationTxHash is provided', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      id: 'bt-2',
      reference: 'BRG-123-abc',
      amount: '10',
      transactionHash: '0xkept',
      metadata: {},
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue(null);

    await service.confirmDelivery({
      reference: 'BRG-123-abc',
      oframpFundingReference: 'OFF-456',
    });

    expect(prisma.bridgeTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          transactionHash: '0xkept',
          offrampReference: 'OFF-456',
        }),
      }),
    );
  });

  it('does not update an offramp order when none matches the funding reference', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      id: 'bt-3',
      reference: 'BRG-123-abc',
      amount: '5',
      transactionHash: null,
      metadata: {},
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue(null);

    const result = await service.confirmDelivery(delivery);

    expect(prisma.offrampProviderOrder.update).not.toHaveBeenCalled();
    expect(result.offramp).toBeNull();
  });

  it('accepts an explicit delivery status override', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      id: 'bt-4',
      reference: 'BRG-123-abc',
      amount: '10',
      transactionHash: null,
      metadata: {},
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue({
      id: 'po-4',
      reference: 'OFF-456',
    });

    await service.confirmDelivery({
      reference: 'BRG-123-abc',
      oframpFundingReference: 'OFF-456',
      status: 'DELAYED',
    });

    expect(prisma.bridgeTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
    expect(prisma.offrampProviderOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bridgeStatus: 'DELAYED' }),
      }),
    );
  });

  it('rejects an unknown delivery status without touching any records', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      id: 'bt-7',
      reference: 'BRG-123-abc',
      amount: '20',
      transactionHash: '0xdest-succeeded',
      status: 'PENDING',
      metadata: {},
    });
    await expect(
      service.confirmDelivery({
        ...delivery,
        status: 'BOGUS',
      }),
    ).rejects.toThrow(new BadRequestException('Unknown delivery status: BOGUS'));

    expect(prisma.bridgeTransaction.update).not.toHaveBeenCalled();
    expect(prisma.offrampProviderOrder.update).not.toHaveBeenCalled();
  });

  it('ignores a non-SUCCESS status when the bridge transfer is already terminal', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      id: 'bt-5',
      reference: 'BRG-123-abc',
      amount: '20',
      transactionHash: '0xdest-succeeded',
      status: 'SUCCESS',
      metadata: {},
    });

    const result = await service.confirmDelivery({
      ...delivery,
      status: 'DELAYED',
    });

    expect(prisma.bridgeTransaction.update).not.toHaveBeenCalled();
    expect(prisma.offrampProviderOrder.update).not.toHaveBeenCalled();
    expect(result.bridge).toEqual(
      expect.objectContaining({ id: 'bt-5', status: 'SUCCESS' }),
    );
    expect(result.offramp).toBeNull();
  });

  it('still applies SUCCESS on top of a terminal failure to recover the delivery', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      id: 'bt-6',
      reference: 'BRG-123-abc',
      amount: '30',
      transactionHash: null,
      status: 'FAILED',
      metadata: {},
    });
    prisma.bridgeTransaction.update.mockResolvedValue({
      id: 'bt-6',
      reference: 'BRG-123-abc',
      status: 'SUCCESS',
      offrampReference: 'OFF-456',
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue({
      id: 'po-6',
      reference: 'OFF-456',
    });
    prisma.offrampProviderOrder.update.mockResolvedValue({
      id: 'po-6',
      bridgeStatus: 'SUCCESS',
    });

    await service.confirmDelivery(delivery);

    expect(prisma.bridgeTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(prisma.offrampProviderOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bridgeStatus: 'SUCCESS' }),
      }),
    );
  });
});

describe('BridgeService.initiateBridge', () => {
  let service: BridgeService;
  let prisma: any;

  const dto = {
    fromChain: 'Base',
    toChain: 'Ethereum_Sepolia',
    amount: '25.50',
    destinationAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    sourceAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  };

  beforeEach(async () => {
    prisma = {
      bridgeTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      offrampProviderOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BridgeService>(BridgeService);
  });

  it('throws BadRequestException when the bridge signing key is not configured', async () => {
    await expect(service.initiateBridge(dto)).rejects.toThrow(
      new BadRequestException(
        'Failed to initiate bridge: Bridge signing key CCTP_BRIDGE_PRIVATE_KEY is not configured',
      ),
    );
    expect(prisma.bridgeTransaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.bridgeTransaction.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the source chain is unsupported', async () => {
    await expect(
      service.initiateBridge({ ...dto, fromChain: 'BSC' }),
    ).rejects.toThrow(new BadRequestException('Chain BSC is not supported.'));
    expect(prisma.bridgeTransaction.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the destination chain is unsupported', async () => {
    await expect(
      service.initiateBridge({ ...dto, toChain: 'BSC' }),
    ).rejects.toThrow(new BadRequestException('Chain BSC is not supported.'));
    expect(prisma.bridgeTransaction.create).not.toHaveBeenCalled();
  });

  it('accepts Stellar as a destination chain', async () => {
    prisma.bridgeTransaction.create.mockResolvedValue({
      status: 'PENDING',
      transactionHash: null,
    });

    const result = await service.initiateBridge({
      ...dto,
      toChain: 'Stellar_Testnet',
      destinationAddress: `G${'A'.repeat(55)}`,
      recordOnly: true,
    });

    expect(result.status).toBe('PENDING');
    expect(result.toChain).toBe('Stellar_Testnet');
    expect(prisma.bridgeTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('records the transfer without server-side execution when recordOnly is set', async () => {
    prisma.bridgeTransaction.create.mockResolvedValue({
      status: 'PENDING',
      transactionHash: null,
    });

    const result = await service.initiateBridge({
      ...dto,
      recordOnly: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        sourceTxHash: null,
        destinationTxHash: null,
      }),
    );
    expect(prisma.bridgeTransaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.bridgeTransaction.update).not.toHaveBeenCalled();
  });
});

describe('BridgeService off-ramp linking', () => {
  let service: BridgeService;
  let prisma: any;

  const dto = {
    fromChain: 'Base_Sepolia',
    toChain: 'Stellar_Testnet',
    amount: '25.50',
    sourceAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    destinationAddress: 'G'.padEnd(56, 'A'),
  };

  beforeEach(async () => {
    prisma = {
      bridgeTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      offrampProviderOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BridgeService>(BridgeService);
  });

  it('links the off-ramp order at initiate when offrampReference is provided', async () => {
    prisma.bridgeTransaction.create.mockResolvedValue({
      reference: 'BRG-x',
      status: 'PENDING',
      transactionHash: null,
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue({
      id: 'po-1',
      reference: 'OFF-1',
    });

    await service.initiateBridge({
      ...dto,
      recordOnly: true,
      offrampReference: 'OFF-1',
    });

    expect(prisma.bridgeTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ offrampReference: 'OFF-1' }),
    });
    expect(prisma.offrampProviderOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: {
        bridgeReference: expect.stringMatching(/^BRG-/),
        bridgeStatus: 'PENDING',
      },
    });
  });

  it('still records the bridge when the off-ramp order is missing', async () => {
    prisma.bridgeTransaction.create.mockResolvedValue({
      reference: 'BRG-y',
      status: 'PENDING',
      transactionHash: null,
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue(null);

    const result = await service.initiateBridge({
      ...dto,
      recordOnly: true,
      offrampReference: 'OFF-missing',
    });

    expect(result).toEqual(
      expect.objectContaining({
        reference: expect.stringMatching(/^BRG-/),
        status: 'PENDING',
      }),
    );
    expect(prisma.offrampProviderOrder.update).not.toHaveBeenCalled();
  });

  it('mirrors DESTINATION_TX to the off-ramp order as SUCCESS with the deposit hash', async () => {
    prisma.bridgeTransaction.findUnique.mockResolvedValue({
      reference: 'BRG-1',
      status: 'PROCESSING',
      offrampReference: 'OFF-1',
      metadata: {},
    });
    prisma.bridgeTransaction.update.mockResolvedValue({
      reference: 'BRG-1',
      status: 'COMPLETED',
    });
    prisma.offrampProviderOrder.findUnique.mockResolvedValue({
      id: 'po-1',
      reference: 'OFF-1',
    });

    await service.updateBridgeStatus(
      'BRG-1',
      '0xdest',
      'DESTINATION_TX',
      'COMPLETED',
    );

    expect(prisma.offrampProviderOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: { bridgeStatus: 'SUCCESS', depositTxHash: '0xdest' },
    });
  });
});
