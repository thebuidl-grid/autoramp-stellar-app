import { Test, TestingModule } from '@nestjs/testing';
import { Keypair, Asset } from '@stellar/stellar-sdk';

process.env.BRIDGE_USDC_ISSUER_PUBLIC_KEY = process.env.BRIDGE_USDC_ISSUER_PUBLIC_KEY || Keypair.random().publicKey();

import { OnrampDeliveryService } from './onramp-delivery.service';
import { StellarService } from '../stellar/stellar.service';
import { SwapService } from '../swap/swap.service';
import { BridgeService } from '../bridge/bridge.service';

const cngnIssuer = Keypair.random().publicKey();
const brzIssuer = Keypair.random().publicKey();
const corridor = { stablecoinCode: 'CNGN', stablecoinIssuer: cngnIssuer };
const destination = Keypair.random().publicKey();

describe('OnrampDeliveryService', () => {
  let service: OnrampDeliveryService;
  let stellarService: {
    getStrictSendQuote: jest.Mock;
    swapFromDistribution: jest.Mock;
    sendFromDistribution: jest.Mock;
    executeCctpBurnFromDistribution: jest.Mock;
  };
  let swapService: { resolveAsset: jest.Mock };
  let bridgeService: { createCustodialTransferFromDistribution: jest.Mock };

  beforeEach(async () => {
    stellarService = {
      getStrictSendQuote: jest.fn(),
      swapFromDistribution: jest.fn(),
      sendFromDistribution: jest.fn(),
      executeCctpBurnFromDistribution: jest.fn(),
    };
    swapService = { resolveAsset: jest.fn() };
    bridgeService = { createCustodialTransferFromDistribution: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnrampDeliveryService,
        { provide: StellarService, useValue: stellarService },
        { provide: SwapService, useValue: swapService },
        { provide: BridgeService, useValue: bridgeService },
      ],
    }).compile();

    service = module.get<OnrampDeliveryService>(OnrampDeliveryService);
  });

  describe('Stellar target', () => {
    it('pays out the corridor stablecoin directly with no swap hop when payoutTokenCode matches the corridor', async () => {
      stellarService.sendFromDistribution.mockResolvedValue('mintHash1');

      const result = await service.deliverOnramp({
        userId: 'user-1',
        corridor,
        mintAmount: '10000',
        payoutChain: 'stellar',
        payoutTokenCode: 'CNGN',
        destinationAddress: destination,
      });

      expect(stellarService.swapFromDistribution).not.toHaveBeenCalled();
      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '10000', destination }),
      );
      expect(result).toEqual({ mintTxHash: 'mintHash1' });
    });

    it('pays out directly with no swap hop when payoutTokenCode is null (defaults to the corridor asset)', async () => {
      stellarService.sendFromDistribution.mockResolvedValue('mintHash2');

      await service.deliverOnramp({
        userId: 'user-1',
        corridor,
        mintAmount: '10000',
        payoutChain: 'stellar',
        payoutTokenCode: null,
        destinationAddress: destination,
      });

      expect(stellarService.swapFromDistribution).not.toHaveBeenCalled();
      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '10000', destination }),
      );
    });

    it('swaps inside the distribution account first, then pays out the target asset, when payoutTokenCode differs from the corridor', async () => {
      const brzAsset = new Asset('BRZ', brzIssuer);
      swapService.resolveAsset.mockResolvedValue(brzAsset);
      stellarService.getStrictSendQuote.mockResolvedValue({ destinationAmount: '1800', path: [] });
      stellarService.sendFromDistribution.mockResolvedValue('mintHash3');

      const result = await service.deliverOnramp({
        userId: 'user-1',
        corridor,
        mintAmount: '10000',
        payoutChain: 'stellar',
        payoutTokenCode: 'BRZ',
        destinationAddress: destination,
      });

      expect(swapService.resolveAsset).toHaveBeenCalledWith('BRZ');
      expect(stellarService.swapFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ sendAmount: '10000', destAsset: brzAsset, destMin: '1710.0000000' }),
      );
      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ asset: brzAsset, amount: '1800', destination }),
      );
      expect(result).toEqual({ mintTxHash: 'mintHash3' });
    });
  });

  describe('EVM target', () => {
    it('swaps the corridor stablecoin to bridge-USDC, then bridges out via a custodial CCTP burn', async () => {
      stellarService.getStrictSendQuote.mockResolvedValue({ destinationAmount: '6.25', path: [] });
      bridgeService.createCustodialTransferFromDistribution.mockResolvedValue('bridge_ref_1');
      const evmDestination = '0x000000000000000000000000000000000000aa';

      const result = await service.deliverOnramp({
        userId: 'user-1',
        corridor,
        mintAmount: '10000',
        payoutChain: 'base',
        payoutTokenCode: null,
        destinationAddress: evmDestination,
      });

      expect(stellarService.swapFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ sendAmount: '10000', destMin: '5.9375000' }),
      );
      // payoutTokenCode was null, so it defaults to the corridor's own code
      // (CNGN) — still passed through (not USDC) since the bridge's
      // follow-up destination swap needs to know to convert to it.
      expect(bridgeService.createCustodialTransferFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          destinationChain: 'base',
          destinationAddress: evmDestination,
          usdcAmount: '6.25',
          payoutTokenCode: 'CNGN',
        }),
      );
      expect(result).toEqual({ bridgeReference: 'bridge_ref_1' });
    });

    it('passes a non-USDC payoutTokenCode through to the bridge for the follow-up destination swap', async () => {
      stellarService.getStrictSendQuote.mockResolvedValue({ destinationAmount: '6.25', path: [] });
      bridgeService.createCustodialTransferFromDistribution.mockResolvedValue('bridge_ref_2');
      const evmDestination = '0x000000000000000000000000000000000000aa';

      await service.deliverOnramp({
        userId: 'user-1',
        corridor,
        mintAmount: '10000',
        payoutChain: 'base',
        payoutTokenCode: 'brz',
        destinationAddress: evmDestination,
      });

      expect(bridgeService.createCustodialTransferFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ payoutTokenCode: 'BRZ' }),
      );
    });
  });
});
