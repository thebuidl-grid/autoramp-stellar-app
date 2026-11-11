import { Test, TestingModule } from '@nestjs/testing';
import { OtcService } from './otc.service';
import { PrismaService } from '../../database/prisma.service';
import { MFBService } from '../safehaven/safehaven.service';
import { SwapService } from '../swap/swap.service';
import { ZeroExService } from '../swap/integrations/zeroex.service';
import { RampService } from '../ramp/ramp.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('OtcService', () => {
  let service: OtcService;
  let prisma: PrismaService;
  let safeHavenService: MFBService;

  const mockPrisma = {
    otcUser: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    otcTransaction: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockMFBService = {
    createVirtualAccount: jest.fn(),
  };

  const mockZeroExService = {
    getOtcRate: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockRampService = {
    otcOnRampQuote: jest.fn(),
    otcOnRampExecute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtcService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MFBService, useValue: mockMFBService },
        { provide: ZeroExService, useValue: mockZeroExService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RampService, useValue: mockRampService },
      ],
    }).compile();

    service = module.get<OtcService>(OtcService);
    prisma = module.get<PrismaService>(PrismaService);
    safeHavenService = module.get<MFBService>(MFBService);
  });

  describe('initiateTransaction', () => {
    it('should create transaction and then generate virtual account', async () => {
      const mockOtcUser = {
        id: 'otc-1',
        userId: 'user-1',
      };
      const mockSHAccount = {
        account_number: '1234567890',
        bank_code: '090286',
        account_name: 'OTC Test',
        bank_name: 'MFB MFB',
      };

      mockPrisma.otcUser.findUnique.mockResolvedValue(mockOtcUser);
      // mockZeroExService.getOtcRate.mockResolvedValue({ rate: 1600 });
      mockRampService.otcOnRampQuote.mockResolvedValue({
        status: 'success',
        data: {
          rate: 1600,
          source: { amount: 12000, currency: 'USDC' },
          destination: { amount: 19200000, currency: 'NGN' },
        },
      });
      mockPrisma.otcTransaction.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'tx-123', reference: data.reference, ...data }),
      );
      mockRampService.otcOnRampExecute.mockResolvedValue({
        status: 'success',
        data: { deposit: mockSHAccount },
      });
      mockConfigService.get.mockReturnValue('https://webhook.site/test');

      const result: any = await service.initiateTransaction('user-1', {
        quantity: 12000,
        token: 'USDC',
        network: 'base',
        address: '0xabc',
      });

      // Verify transaction was created
      expect(prisma.otcTransaction.create).toHaveBeenCalled();

      // Verify Flint execution was called with correct amount and reference
      const txnRef =
        mockPrisma.otcTransaction.create.mock.calls[0][0].data.reference;

      // The code now uses sourceAmount from provider response
      expect(mockRampService.otcOnRampExecute).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          reference: txnRef,
          amount: 12000,
        }),
      );

      // Verify result contains issuance details in camelCase (mapped from snake_case)
      expect(result.issuance).toEqual({
        bankCode: mockSHAccount.bank_code,
        accountNumber: mockSHAccount.account_number,
        accountName: mockSHAccount.account_name,
        bankName: mockSHAccount.bank_name,
      });
    });

    it('should throw BadRequestException if quantity is less than 1', async () => {
      const mockOtcUser = {
        id: 'otc-1',
        userId: 'user-1',
      };
      mockPrisma.otcUser.findUnique.mockResolvedValue(mockOtcUser);

      await expect(
        service.initiateTransaction('user-1', {
          quantity: 0.5,
          token: 'USDC',
          network: 'base',
          address: '0xabc',
        }),
      ).rejects.toThrow(
        new BadRequestException('Minimum quantity for OTC is 1 USD'),
      );
    });
  });
});
