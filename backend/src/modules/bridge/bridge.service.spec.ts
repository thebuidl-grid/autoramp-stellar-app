import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { BridgeService } from './bridge.service';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { ChainRegistryService } from './chain-registry.service';
import { ChainTokenRegistryService } from './chain-token-registry.service';
import { CctpAttestationClient } from './providers/cctp-attestation-client.service';
import { EvmRelayerService } from './providers/evm-relayer.service';
import { ZeroXSwapQuoteService } from './providers/zerox-swap-quote.service';
import { SwapService } from '../swap/swap.service';
import { CorridorService } from '../corridor/corridor.service';
import { OfframpDeliveryService } from '../stablestack/offramp-delivery.service';

describe('BridgeService', () => {
  let service: BridgeService;
  let prisma: {
    bridgeTransfer: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    transactionLog: { create: jest.Mock };
  };
  let stellarService: {
    mintCctpTransfer: jest.Mock;
    buildCctpApproveTransaction: jest.Mock;
    buildCctpBurnTransaction: jest.Mock;
    sendFromDistribution: jest.Mock;
    getBalance: jest.Mock;
    executeCctpBurnFromDistribution: jest.Mock;
  };
  let chainRegistry: { findByName: jest.Mock };
  let chainTokenRegistry: { findByCode: jest.Mock; findAll: jest.Mock };
  let attestationClient: { getAttestation: jest.Mock };
  let evmRelayer: {
    buildDepositForBurnTransactions: jest.Mock;
    buildErc20ApproveTransaction: jest.Mock;
    getUsdcBalance: jest.Mock;
    mint: jest.Mock;
    formatUsdc: jest.Mock;
  };
  let zeroXSwapQuote: { getSwapQuote: jest.Mock };
  let swapService: { getSwapQuote: jest.Mock };
  let corridorService: { findByStablecoinCode: jest.Mock; findByCurrency: jest.Mock };
  let offrampDeliveryService: { executePayout: jest.Mock };
  let config: { get: jest.Mock };

  const baseChain = {
    name: 'base',
    chainType: 'EVM',
    cctpDomain: 6,
    usdcAddress: '0xusdc',
    tokenMessengerAddress: '0xTokenMessenger',
    messageTransmitterAddress: '0xMessageTransmitter',
  };
  const stellarChain = {
    name: 'stellar',
    chainType: 'STELLAR',
    cctpDomain: 27,
    // Must be a real, decodable contract strkey — buildDestinationEncoding
    // now converts this to its raw 32 bytes via StrKey.decodeContract, which
    // throws on a placeholder like the old 'CFORWARDER' string.
    cctpForwarderAddress: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
    tokenMessengerAddress: 'CTOKENMESSENGER',
    usdcAddress: 'GUSDCISSUER',
  };
  const destination = Keypair.random().publicKey();
  const distributionAccount = Keypair.random().publicKey();
  const evmDestination = '0x000000000000000000000000000000000000aa';
  const evmSourceAddress = '0x000000000000000000000000000000000000bb';

  beforeEach(async () => {
    prisma = {
      bridgeTransfer: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transactionLog: { create: jest.fn() },
    };
    stellarService = {
      mintCctpTransfer: jest.fn(),
      buildCctpApproveTransaction: jest.fn(),
      buildCctpBurnTransaction: jest.fn(),
      sendFromDistribution: jest.fn(),
      getBalance: jest.fn(),
      executeCctpBurnFromDistribution: jest.fn(),
    };
    chainRegistry = {
      findByName: jest.fn((name: string) => {
        if (name === 'base') return Promise.resolve(baseChain);
        if (name === 'stellar') return Promise.resolve(stellarChain);
        return Promise.reject(new NotFoundException(`No chain "${name}"`));
      }),
    };
    chainTokenRegistry = { findByCode: jest.fn(), findAll: jest.fn() };
    attestationClient = { getAttestation: jest.fn() };
    evmRelayer = {
      buildDepositForBurnTransactions: jest.fn(),
      buildErc20ApproveTransaction: jest.fn(),
      getUsdcBalance: jest.fn(),
      mint: jest.fn(),
      formatUsdc: jest.fn((raw: bigint) => (Number(raw) / 1_000_000).toString()),
    };
    zeroXSwapQuote = { getSwapQuote: jest.fn() };
    swapService = { getSwapQuote: jest.fn() };
    corridorService = { findByStablecoinCode: jest.fn(), findByCurrency: jest.fn() };
    offrampDeliveryService = { executePayout: jest.fn() };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          STELLAR_DISTRIBUTION_PUBLIC_KEY: distributionAccount,
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: StellarService, useValue: stellarService },
        { provide: ChainRegistryService, useValue: chainRegistry },
        { provide: ChainTokenRegistryService, useValue: chainTokenRegistry },
        { provide: CctpAttestationClient, useValue: attestationClient },
        { provide: EvmRelayerService, useValue: evmRelayer },
        { provide: ZeroXSwapQuoteService, useValue: zeroXSwapQuote },
        { provide: SwapService, useValue: swapService },
        { provide: CorridorService, useValue: corridorService },
        { provide: OfframpDeliveryService, useValue: offrampDeliveryService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(BridgeService);
  });

  describe('createTransferIntent — EVM source (self-custodial burn)', () => {
    const fakeTxs = {
      approveTx: { to: '0xusdc', data: '0xapprove', value: '0x0' },
      burnTx: { to: '0xTokenMessenger', data: '0xburn', value: '0x0' },
    };

    it('requires sourceAddress', async () => {
      await expect(
        service.createTransferIntent({
          sourceChain: 'base',
          destinationAddress: destination,
        }),
      ).rejects.toThrow('sourceAddress');
      expect(prisma.bridgeTransfer.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING_BURN transfer and returns unsigned approve/burn transactions', async () => {
      prisma.bridgeTransfer.create.mockResolvedValue({});
      evmRelayer.buildDepositForBurnTransactions.mockReturnValue(fakeTxs);

      const result = await service.createTransferIntent({
        sourceChain: 'base',
        destinationAddress: destination,
        expectedAmount: 100,
        sourceAddress: evmSourceAddress,
      });

      expect(result.approveTransaction).toEqual(fakeTxs.approveTx);
      expect(result.burnTransaction).toEqual(fakeTxs.burnTx);
      expect(result.destinationChain).toBe('stellar');
      expect(evmRelayer.buildDepositForBurnTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ sourceChain: baseChain, amount: '100', destinationDomain: 27 }),
      );
      expect(prisma.bridgeTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            collectionAddress: expect.anything(),
            collectionAddressEncryptedKey: expect.anything(),
            gasFundingTxHash: expect.anything(),
          }),
        }),
      );
    });

    it('rejects when sourceChain === destinationChain', async () => {
      await expect(
        service.createTransferIntent({ sourceChain: 'base', destinationChain: 'base', destinationAddress: destination, sourceAddress: evmSourceAddress }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bridgeTransfer.create).not.toHaveBeenCalled();
    });

    it('propagates an unknown source chain as NotFoundException', async () => {
      await expect(
        service.createTransferIntent({ sourceChain: 'unknown-chain', destinationAddress: destination, sourceAddress: evmSourceAddress }),
      ).rejects.toThrow(NotFoundException);
    });

    it('supports an EVM destination (mints straight to the address, no forwarder)', async () => {
      prisma.bridgeTransfer.create.mockResolvedValue({});
      evmRelayer.buildDepositForBurnTransactions.mockReturnValue(fakeTxs);
      chainRegistry.findByName.mockImplementation((name: string) => {
        if (name === 'base') return Promise.resolve(baseChain);
        if (name === 'ethereum')
          return Promise.resolve({ ...baseChain, name: 'ethereum', cctpDomain: 0 });
        return Promise.reject(new NotFoundException());
      });

      const result = await service.createTransferIntent({
        sourceChain: 'base',
        destinationChain: 'ethereum',
        destinationAddress: evmDestination,
        sourceAddress: evmSourceAddress,
      });

      expect(result.destinationChain).toBe('ethereum');
    });
  });

  describe('createTransferIntent — Stellar source (self-custodial burn)', () => {
    it('requires sourceAddress', async () => {
      await expect(
        service.createTransferIntent({
          sourceChain: 'stellar',
          destinationChain: 'base',
          destinationAddress: evmDestination,
        }),
      ).rejects.toThrow('sourceAddress');
    });

    it('builds the unsigned approve XDR and creates a PENDING_BURN transfer', async () => {
      stellarService.buildCctpApproveTransaction.mockResolvedValue({
        xdr: 'BBBB...',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
      prisma.bridgeTransfer.create.mockResolvedValue({});

      const result = await service.createTransferIntent({
        sourceChain: 'stellar',
        destinationChain: 'base',
        destinationAddress: evmDestination,
        expectedAmount: 50,
        sourceAddress: evmSourceAddress.replace('bb', 'cc'), // stand-in Stellar pubkey shape not enforced by the mock
      });

      expect(result.approveTransactionXdr).toBe('BBBB...');
      expect(stellarService.buildCctpApproveTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenMessengerAddress: 'CTOKENMESSENGER',
          amount: '50',
        }),
      );
      expect(prisma.bridgeTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sourceChain: 'stellar', destinationChain: 'base' }) }),
      );
      expect(evmRelayer.buildDepositForBurnTransactions).not.toHaveBeenCalled(); // Stellar branch — nothing EVM to build
    });
  });

  describe('buildBurnTransaction', () => {
    it('re-derives destination encoding and builds the burn XDR for a stored transfer', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({
        reference: 'txn_ref_a',
        sourceChain: 'stellar',
        destinationChain: 'base',
        destinationAddress: evmDestination,
        expectedAmount: { toString: () => '50' },
        payoutStablecoinCode: null,
      });
      stellarService.buildCctpBurnTransaction.mockResolvedValue({
        xdr: 'AAAA...',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      const result = await service.buildBurnTransaction('txn_ref_a', 'GSOURCE');

      expect(result.burnTransactionXdr).toBe('AAAA...');
      expect(stellarService.buildCctpBurnTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          userPublicKey: 'GSOURCE',
          tokenMessengerAddress: 'CTOKENMESSENGER',
          amount: '50',
          destinationDomain: 6,
        }),
      );
    });

    it('rejects when the transfer is not found', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue(null);

      await expect(service.buildBurnTransaction('missing', 'GSOURCE')).rejects.toThrow(NotFoundException);
    });

    it('rejects when the transfer was not Stellar-source', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({
        reference: 'txn_ref_a',
        sourceChain: 'base',
        destinationChain: 'stellar',
      });

      await expect(service.buildBurnTransaction('txn_ref_a', '0xabc')).rejects.toThrow(BadRequestException);
    });
  });

  describe('createTransferIntent — Swap tab payout', () => {
    it('allows a payout code when destinationChain is stellar', async () => {
      prisma.bridgeTransfer.create.mockResolvedValue({});
      evmRelayer.buildDepositForBurnTransactions.mockReturnValue({
        approveTx: { to: '0xusdc', data: '0xapprove', value: '0x0' },
        burnTx: { to: '0xTokenMessenger', data: '0xburn', value: '0x0' },
      });
      corridorService.findByStablecoinCode.mockResolvedValue({ stablecoinCode: 'CNGN' });
      swapService.getSwapQuote.mockResolvedValue({ destinationAmount: '160000', exchangeRate: 1600 });

      await expect(
        service.createTransferIntent({
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: destination,
          payoutStablecoinCode: 'CNGN',
          sourceAddress: evmSourceAddress,
          expectedAmount: 100,
        }),
      ).resolves.toBeDefined();
      expect(corridorService.findByStablecoinCode).toHaveBeenCalledWith('CNGN');
    });

    it('rejects an EVM destination with a payout code', async () => {
      chainRegistry.findByName.mockImplementation((name: string) => {
        if (name === 'base') return Promise.resolve(baseChain);
        if (name === 'ethereum') return Promise.resolve({ ...baseChain, name: 'ethereum', cctpDomain: 0 });
        return Promise.reject(new NotFoundException());
      });

      await expect(
        service.createTransferIntent({
          sourceChain: 'base',
          destinationChain: 'ethereum',
          destinationAddress: evmDestination,
          payoutStablecoinCode: 'CNGN',
          sourceAddress: evmSourceAddress,
        }),
      ).rejects.toThrow('payoutStablecoinCode requires destinationChain to be stellar');
    });

    it('validates the stablecoin code exists up front', async () => {
      corridorService.findByStablecoinCode.mockRejectedValue(new NotFoundException('no such corridor'));

      await expect(
        service.createTransferIntent({
          sourceChain: 'base',
          destinationAddress: destination,
          payoutStablecoinCode: 'NOPE',
          sourceAddress: evmSourceAddress,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTransferIntent — payoutTokenCode (EVM destination follow-up swap)', () => {
    beforeEach(() => {
      chainRegistry.findByName.mockImplementation((name: string) => {
        if (name === 'base') return Promise.resolve(baseChain);
        if (name === 'ethereum') return Promise.resolve({ ...baseChain, name: 'ethereum', cctpDomain: 0 });
        if (name === 'stellar') return Promise.resolve(stellarChain);
        return Promise.reject(new NotFoundException());
      });
    });

    it('validates the token against the destination chain and persists it', async () => {
      prisma.bridgeTransfer.create.mockResolvedValue({});
      evmRelayer.buildDepositForBurnTransactions.mockReturnValue({
        approveTx: { to: '0xusdc', data: '0xapprove', value: '0x0' },
        burnTx: { to: '0xTokenMessenger', data: '0xburn', value: '0x0' },
      });
      chainTokenRegistry.findByCode.mockResolvedValue({ tokenCode: 'BRZ', address: '0xbrz', decimals: 18 });

      await service.createTransferIntent({
        sourceChain: 'base',
        destinationChain: 'ethereum',
        destinationAddress: evmDestination,
        payoutTokenCode: 'brz',
        sourceAddress: evmSourceAddress,
        expectedAmount: 100,
      });

      expect(chainTokenRegistry.findByCode).toHaveBeenCalledWith('ethereum', 'BRZ');
      expect(prisma.bridgeTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payoutTokenCode: 'BRZ' }) }),
      );
    });

    it('rejects a Stellar destination', async () => {
      await expect(
        service.createTransferIntent({
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: destination,
          payoutTokenCode: 'CNGN',
          sourceAddress: evmSourceAddress,
          expectedAmount: 100,
        }),
      ).rejects.toThrow('payoutTokenCode requires an EVM destinationChain');
    });

    it('rejects being combined with payoutStablecoinCode', async () => {
      // payoutStablecoinCode's own block runs first and requires a Stellar
      // destination to get past its chain-type check without throwing for
      // an unrelated reason, so it must fully succeed before the
      // payoutTokenCode block's mutual-exclusion check is ever reached.
      corridorService.findByStablecoinCode.mockResolvedValue({ stablecoinCode: 'CNGN' });
      swapService.getSwapQuote.mockResolvedValue({ destinationAmount: '160000', exchangeRate: 1600 });

      await expect(
        service.createTransferIntent({
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: destination,
          payoutTokenCode: 'BRZ',
          payoutStablecoinCode: 'CNGN',
          sourceAddress: evmSourceAddress,
          expectedAmount: 100,
        }),
      ).rejects.toThrow('mutually exclusive');
    });

    it('propagates an unregistered token as NotFoundException', async () => {
      chainTokenRegistry.findByCode.mockRejectedValue(new NotFoundException('no such token'));

      await expect(
        service.createTransferIntent({
          sourceChain: 'base',
          destinationChain: 'ethereum',
          destinationAddress: evmDestination,
          payoutTokenCode: 'NOPE',
          sourceAddress: evmSourceAddress,
          expectedAmount: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTransferIntent — payoutFiat (Sell any-chain)', () => {
    const nairaCorridor = { countryCode: 'NG', fiatCurrency: 'NGN', stablecoinCode: 'CNGN' };

    it('requires an authenticated user', async () => {
      await expect(
        service.createTransferIntent(
          {
            sourceChain: 'base',
            destinationChain: 'stellar',
            payoutFiat: true,
            payoutBankCode: '058',
            payoutAccountNumber: '0123456789',
            payoutFiatCurrency: 'NGN',
            sourceAddress: evmSourceAddress,
            expectedAmount: 100,
          },
          undefined, // no userId
        ),
      ).rejects.toThrow('payoutFiat requires an authenticated user');
    });

    it('requires bank details', async () => {
      await expect(
        service.createTransferIntent(
          {
            sourceChain: 'base',
            destinationChain: 'stellar',
            payoutFiat: true,
            sourceAddress: evmSourceAddress,
            expectedAmount: 100,
          },
          'user-1',
        ),
      ).rejects.toThrow('payoutBankCode, payoutAccountNumber, and payoutFiatCurrency are all required');
    });

    it('rejects an EVM destination', async () => {
      chainRegistry.findByName.mockImplementation((name: string) => {
        if (name === 'base') return Promise.resolve(baseChain);
        if (name === 'ethereum') return Promise.resolve({ ...baseChain, name: 'ethereum', cctpDomain: 0 });
        return Promise.reject(new NotFoundException());
      });

      await expect(
        service.createTransferIntent(
          {
            sourceChain: 'base',
            destinationChain: 'ethereum',
            destinationAddress: evmDestination,
            payoutFiat: true,
            payoutBankCode: '058',
            payoutAccountNumber: '0123456789',
            payoutFiatCurrency: 'NGN',
            sourceAddress: evmSourceAddress,
            expectedAmount: 100,
          },
          'user-1',
        ),
      ).rejects.toThrow('payoutFiat requires destinationChain to be stellar');
    });

    it('quotes the fiat payout up front, defaults destinationAddress to the distribution account, and persists everything', async () => {
      prisma.bridgeTransfer.create.mockResolvedValue({});
      evmRelayer.buildDepositForBurnTransactions.mockReturnValue({
        approveTx: { to: '0xusdc', data: '0xapprove', value: '0x0' },
        burnTx: { to: '0xTokenMessenger', data: '0xburn', value: '0x0' },
      });
      corridorService.findByCurrency.mockResolvedValue(nairaCorridor);
      swapService.getSwapQuote.mockResolvedValue({ destinationAmount: '160000', exchangeRate: 1600 });

      const result = await service.createTransferIntent(
        {
          sourceChain: 'base',
          destinationChain: 'stellar',
          // destinationAddress omitted deliberately
          payoutFiat: true,
          payoutBankCode: '058',
          payoutAccountNumber: '0123456789',
          payoutFiatCurrency: 'ngn',
          sourceAddress: evmSourceAddress,
          expectedAmount: 100,
        },
        'user-1',
      );

      expect(corridorService.findByCurrency).toHaveBeenCalledWith('NGN');
      expect(swapService.getSwapQuote).toHaveBeenCalledWith('USDC', 'CNGN', 100);
      expect(result.estimatedPayoutAmount).toBe('160000');
      expect(prisma.bridgeTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            destinationAddress: distributionAccount,
            payoutFiat: true,
            payoutBankCode: '058',
            payoutAccountNumber: '0123456789',
            payoutFiatCurrency: 'NGN',
            quotedPayoutAmount: '160000',
          }),
        }),
      );
    });

    it('rejects being combined with payoutTokenCode', async () => {
      // payoutTokenCode's own block runs first and requires an EVM
      // destination to get past its chain-type check without throwing for
      // an unrelated reason, so it must fully succeed before the payoutFiat
      // block's mutual-exclusion check (which runs before payoutFiat's own
      // destinationChain check) is ever reached.
      chainRegistry.findByName.mockImplementation((name: string) => {
        if (name === 'base') return Promise.resolve(baseChain);
        if (name === 'ethereum') return Promise.resolve({ ...baseChain, name: 'ethereum', cctpDomain: 0 });
        return Promise.reject(new NotFoundException());
      });
      chainTokenRegistry.findByCode.mockResolvedValue({ tokenCode: 'BRZ', address: '0xbrz', decimals: 18 });

      await expect(
        service.createTransferIntent(
          {
            sourceChain: 'base',
            destinationChain: 'ethereum',
            destinationAddress: evmDestination,
            payoutFiat: true,
            payoutTokenCode: 'BRZ',
            payoutBankCode: '058',
            payoutAccountNumber: '0123456789',
            payoutFiatCurrency: 'NGN',
            sourceAddress: evmSourceAddress,
            expectedAmount: 100,
          },
          'user-1',
        ),
      ).rejects.toThrow('mutually exclusive');
    });
  });

  describe('buildDestinationSwap', () => {
    it('quotes USDC -> payoutTokenCode and builds approve + swap calldata', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({
        reference: 'txn_ref_a',
        status: 'COMPLETED',
        payoutTokenCode: 'BRZ',
        destinationChain: 'ethereum',
        destinationAddress: evmDestination,
        expectedAmount: { toString: () => '100' },
      });
      chainRegistry.findByName.mockResolvedValue({ ...baseChain, name: 'ethereum' });
      chainTokenRegistry.findByCode.mockResolvedValue({ tokenCode: 'BRZ', address: '0xbrz', decimals: 18 });
      zeroXSwapQuote.getSwapQuote.mockResolvedValue({
        to: '0xrouter',
        data: '0xswap',
        value: '0',
        buyAmount: (550n * 10n ** 18n).toString(),
        minBuyAmount: (540n * 10n ** 18n).toString(),
        allowanceTarget: '0xallowance',
      });
      evmRelayer.buildErc20ApproveTransaction.mockReturnValue({ to: '0xusdc', data: '0xapprove', value: '0x0' });

      const result = await service.buildDestinationSwap('txn_ref_a');

      expect(result.swapTransaction).toEqual({ to: '0xrouter', data: '0xswap', value: '0' });
      expect(result.estimatedOutput).toBe('550');
      expect(result.minOutput).toBe('540');
      expect(zeroXSwapQuote.getSwapQuote).toHaveBeenCalledWith(
        expect.objectContaining({ sellTokenAddress: baseChain.usdcAddress, buyTokenAddress: '0xbrz', takerAddress: evmDestination }),
      );
    });

    it('rejects a transfer that has not completed yet', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({ reference: 'txn_ref_a', status: 'BURNED', payoutTokenCode: 'BRZ' });
      await expect(service.buildDestinationSwap('txn_ref_a')).rejects.toThrow('not COMPLETED yet');
    });

    it('rejects a transfer with no payoutTokenCode', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({ reference: 'txn_ref_a', status: 'COMPLETED', payoutTokenCode: null });
      await expect(service.buildDestinationSwap('txn_ref_a')).rejects.toThrow('has no payoutTokenCode set');
    });

    it('throws NotFoundException for an unknown reference', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue(null);
      await expect(service.buildDestinationSwap('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('buildEvmSwap', () => {
    it('resolves USDC and a ChainToken by code, quotes, and returns approve + swap calldata', async () => {
      chainTokenRegistry.findByCode.mockResolvedValue({ tokenCode: 'CNGNX', address: '0xcngnx', decimals: 6 });
      zeroXSwapQuote.getSwapQuote.mockResolvedValue({
        to: '0xrouter',
        data: '0xswap',
        value: '0',
        buyAmount: (99n * 10n ** 6n).toString(),
        minBuyAmount: (97n * 10n ** 6n).toString(),
        allowanceTarget: '0xallowance',
      });
      evmRelayer.buildErc20ApproveTransaction.mockReturnValue({ to: '0xusdc', data: '0xapprove', value: '0x0' });

      const result = await service.buildEvmSwap({
        chainName: 'base',
        sellTokenCode: 'usdc',
        buyTokenCode: 'cngnx',
        sellAmount: 100,
        takerAddress: evmSourceAddress,
      });

      expect(result.estimatedOutput).toBe('99');
      expect(result.minOutput).toBe('97');
      expect(zeroXSwapQuote.getSwapQuote).toHaveBeenCalledWith(
        expect.objectContaining({ sellTokenAddress: baseChain.usdcAddress, buyTokenAddress: '0xcngnx', takerAddress: evmSourceAddress }),
      );
      expect(chainTokenRegistry.findByCode).toHaveBeenCalledWith('base', 'CNGNX');
    });

    it('rejects a Stellar chain', async () => {
      await expect(
        service.buildEvmSwap({ chainName: 'stellar', sellTokenCode: 'USDC', buyTokenCode: 'CNGN', sellAmount: 100, takerAddress: 'G...' }),
      ).rejects.toThrow('only for EVM chains');
    });

    it('rejects identical sell/buy tokens', async () => {
      await expect(
        service.buildEvmSwap({ chainName: 'base', sellTokenCode: 'USDC', buyTokenCode: 'usdc', sellAmount: 100, takerAddress: evmSourceAddress }),
      ).rejects.toThrow('must differ');
    });
  });

  describe('createCustodialTransferFromDistribution', () => {
    it('signs the burn from the distribution account and records the transfer as already BURNED', async () => {
      chainRegistry.findByName.mockImplementation((name: string) => {
        if (name === 'stellar') return Promise.resolve(stellarChain);
        if (name === 'ethereum') return Promise.resolve({ ...baseChain, name: 'ethereum', cctpDomain: 0 });
        return Promise.reject(new NotFoundException());
      });
      chainTokenRegistry.findByCode.mockResolvedValue({ tokenCode: 'BRZ', address: '0xbrz', decimals: 18 });
      stellarService.executeCctpBurnFromDistribution.mockResolvedValue('custodialBurnHash1');
      prisma.bridgeTransfer.create.mockResolvedValue({});

      const reference = await service.createCustodialTransferFromDistribution({
        destinationChain: 'ethereum',
        destinationAddress: evmDestination,
        usdcAmount: '250',
        payoutTokenCode: 'brz',
      });

      expect(reference).toEqual(expect.any(String));
      expect(stellarService.executeCctpBurnFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ tokenMessengerAddress: stellarChain.tokenMessengerAddress, amount: '250' }),
      );
      expect(prisma.bridgeTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceChain: 'stellar',
            destinationChain: 'ethereum',
            destinationAddress: evmDestination,
            payoutTokenCode: 'BRZ',
            burnTxHash: 'custodialBurnHash1',
            status: 'BURNED',
          }),
        }),
      );
    });

    it('rejects a Stellar destination', async () => {
      await expect(
        service.createCustodialTransferFromDistribution({
          destinationChain: 'stellar',
          destinationAddress: destination,
          usdcAmount: '100',
        }),
      ).rejects.toThrow('only for an EVM destinationChain');
    });
  });

  describe('registerBurn', () => {
    it('moves a PENDING_BURN transfer to BURNED', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({ id: 't1', status: 'PENDING_BURN' });
      prisma.bridgeTransfer.update.mockResolvedValue({ id: 't1', status: 'BURNED' });

      const result = await service.registerBurn('txn_ref_x', '0xburnhash');

      expect(prisma.bridgeTransfer.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { burnTxHash: '0xburnhash', status: 'BURNED' },
      });
      expect(result.status).toBe('BURNED');
    });

    it('is idempotent if already past PENDING_BURN', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({ id: 't1', status: 'BURNED' });
      const result = await service.registerBurn('txn_ref_x', '0xburnhash');
      expect(result.status).toBe('BURNED');
      expect(prisma.bridgeTransfer.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown reference', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue(null);
      await expect(service.registerBurn('missing', '0xhash')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAndCompletePendingTransfers', () => {
    it('completes a transfer to Stellar once an attestation is available', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        {
          id: 't1',
          reference: 'txn_ref_a',
          status: 'BURNED',
          burnTxHash: '0xhash1',
          userId: 'user-1',
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: destination,
          payoutStablecoinCode: null,
        },
      ]);
      attestationClient.getAttestation.mockResolvedValue({
        message: '0xdeadbeef',
        attestation: '0xcafebabe',
        status: 'complete',
      });
      stellarService.mintCctpTransfer.mockResolvedValue('mintHash1');
      prisma.bridgeTransfer.update.mockResolvedValue({ status: 'COMPLETED' });

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 1 });
      expect(stellarService.mintCctpTransfer).toHaveBeenCalledWith({
        cctpForwarderAddress: stellarChain.cctpForwarderAddress,
        message: Buffer.from('deadbeef', 'hex'),
        attestation: Buffer.from('cafebabe', 'hex'),
      });
      expect(prisma.bridgeTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: 'COMPLETED', mintTxHash: 'mintHash1' }),
        }),
      );
    });

    it('completes a transfer to an EVM destination via EvmRelayerService.mint', async () => {
      chainRegistry.findByName.mockImplementation((name: string) => {
        if (name === 'ethereum') return Promise.resolve({ ...baseChain, name: 'ethereum', cctpDomain: 0 });
        return Promise.reject(new NotFoundException());
      });
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        {
          id: 't1',
          reference: 'txn_ref_a',
          status: 'BURNED',
          burnTxHash: '0xhash1',
          userId: 'user-1',
          sourceChain: 'ethereum',
          destinationChain: 'ethereum',
          destinationAddress: evmDestination,
          payoutStablecoinCode: null,
        },
      ]);
      attestationClient.getAttestation.mockResolvedValue({
        message: '0xdead',
        attestation: '0xbeef',
        status: 'complete',
      });
      evmRelayer.mint.mockResolvedValue('0xMINTHASH');
      prisma.bridgeTransfer.update.mockResolvedValue({});

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 1 });
      expect(evmRelayer.mint).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ethereum' }),
        '0xdead',
        '0xbeef',
      );
      expect(stellarService.mintCctpTransfer).not.toHaveBeenCalled();
    });

    it('pays out the corridor stablecoin after a Stellar mint when payoutStablecoinCode is set', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        {
          id: 't1',
          reference: 'txn_ref_a',
          status: 'BURNED',
          burnTxHash: '0xhash1',
          userId: 'user-1',
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: destination,
          payoutStablecoinCode: 'CNGN',
          expectedAmount: 100,
        },
      ]);
      attestationClient.getAttestation.mockResolvedValue({
        message: '0xdead',
        attestation: '0xbeef',
        status: 'complete',
      });
      stellarService.mintCctpTransfer.mockResolvedValue('mintHash1');
      corridorService.findByStablecoinCode.mockResolvedValue({
        stablecoinCode: 'CNGN',
        stablecoinIssuer: Keypair.random().publicKey(),
      });
      swapService.getSwapQuote.mockResolvedValue({ destinationAmount: '160000', exchangeRate: 1600 });
      stellarService.sendFromDistribution.mockResolvedValue('payoutHash1');
      prisma.bridgeTransfer.update.mockResolvedValue({});

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 1 });
      expect(swapService.getSwapQuote).toHaveBeenCalledWith('USDC', 'CNGN', 100);
      expect(stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '160000', destination }),
      );
    });

    it('pays out fiat via OfframpDeliveryService after a Stellar mint when payoutFiat is set', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        {
          id: 't1',
          reference: 'txn_ref_a',
          status: 'BURNED',
          burnTxHash: '0xhash1',
          userId: 'user-1',
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: distributionAccount,
          payoutStablecoinCode: null,
          payoutFiat: true,
          payoutBankCode: '058',
          payoutAccountNumber: '0123456789',
          payoutFiatCurrency: 'NGN',
          expectedAmount: 100,
        },
      ]);
      attestationClient.getAttestation.mockResolvedValue({
        message: '0xdead',
        attestation: '0xbeef',
        status: 'complete',
      });
      stellarService.mintCctpTransfer.mockResolvedValue('mintHash1');
      corridorService.findByCurrency.mockResolvedValue({
        countryCode: 'NG',
        fiatCurrency: 'NGN',
        stablecoinCode: 'CNGN',
      });
      swapService.getSwapQuote.mockResolvedValue({ destinationAmount: '160000', exchangeRate: 1600 });
      offrampDeliveryService.executePayout.mockResolvedValue({ offrampReference: 'offramp_ref_1' });
      prisma.bridgeTransfer.update.mockResolvedValue({});

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 1 });
      expect(corridorService.findByCurrency).toHaveBeenCalledWith('NGN');
      expect(offrampDeliveryService.executePayout).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', fiatAmount: '160000', fiatCurrency: 'NGN', bankCode: '058', accountNumber: '0123456789', bridgeReference: 'txn_ref_a' }),
      );
      expect(stellarService.sendFromDistribution).not.toHaveBeenCalled();
    });

    it('holds the transfer for manual review when the live fiat quote falls below the floor set at intent creation', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        {
          id: 't1',
          reference: 'txn_ref_a',
          status: 'BURNED',
          burnTxHash: '0xhash1',
          userId: 'user-1',
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: distributionAccount,
          payoutStablecoinCode: null,
          payoutFiat: true,
          payoutBankCode: '058',
          payoutAccountNumber: '0123456789',
          payoutFiatCurrency: 'NGN',
          expectedAmount: 100,
          minPayoutAmount: 155000,
        },
      ]);
      attestationClient.getAttestation.mockResolvedValue({
        message: '0xdead',
        attestation: '0xbeef',
        status: 'complete',
      });
      stellarService.mintCctpTransfer.mockResolvedValue('mintHash1');
      corridorService.findByCurrency.mockResolvedValue({
        countryCode: 'NG',
        fiatCurrency: 'NGN',
        stablecoinCode: 'CNGN',
      });
      swapService.getSwapQuote.mockResolvedValue({ destinationAmount: '100000', exchangeRate: 1000 });
      prisma.bridgeTransfer.update.mockResolvedValue({});

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 1 });
      expect(offrampDeliveryService.executePayout).not.toHaveBeenCalled();
      expect(prisma.bridgeTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: expect.objectContaining({ status: 'PAYOUT_HELD' }) }),
      );
    });

    it('leaves a transfer alone when no attestation is ready yet', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        { id: 't1', reference: 'txn_ref_a', status: 'BURNED', burnTxHash: '0xhash1', userId: 'user-1', sourceChain: 'base', destinationChain: 'stellar' },
      ]);
      attestationClient.getAttestation.mockResolvedValue(null);

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 0 });
      expect(stellarService.mintCctpTransfer).not.toHaveBeenCalled();
    });

    it('retries the mint for a transfer already at ATTESTED, without re-fetching the attestation', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        {
          id: 't1',
          reference: 'txn_ref_a',
          status: 'ATTESTED',
          burnTxHash: '0xhash1',
          userId: 'user-1',
          sourceChain: 'base',
          destinationChain: 'stellar',
          destinationAddress: destination,
          payoutStablecoinCode: null,
          rawMessage: '0xdead',
          rawAttestation: '0xbeef',
        },
      ]);
      stellarService.mintCctpTransfer.mockResolvedValue('mintHash1');
      prisma.bridgeTransfer.update.mockResolvedValue({ status: 'COMPLETED' });

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 1 });
      // The whole point: a transfer stuck at ATTESTED (e.g. from a prior
      // missing-relayer-key failure) must be retried without hitting
      // Circle's attestation API again — it already has the proof.
      expect(attestationClient.getAttestation).not.toHaveBeenCalled();
      expect(stellarService.mintCctpTransfer).toHaveBeenCalledWith({
        cctpForwarderAddress: stellarChain.cctpForwarderAddress,
        message: Buffer.from('dead', 'hex'),
        attestation: Buffer.from('beef', 'hex'),
      });
    });

    it('does not double-mint when another tick already claimed the transfer', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        { id: 't1', reference: 'txn_ref_a', status: 'BURNED', burnTxHash: '0xhash1', userId: 'user-1', sourceChain: 'base', destinationChain: 'stellar' },
      ]);
      attestationClient.getAttestation.mockResolvedValue({
        message: '0xdead',
        attestation: '0xbeef',
        status: 'complete',
      });
      prisma.bridgeTransfer.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 1, completed: 0 });
      expect(stellarService.mintCctpTransfer).not.toHaveBeenCalled();
    });

    it('keeps going if one transfer throws, and still reports the rest', async () => {
      prisma.bridgeTransfer.findMany.mockResolvedValue([
        { id: 't1', reference: 'txn_ref_a', status: 'BURNED', burnTxHash: '0xhash1', userId: 'user-1', sourceChain: 'base', destinationChain: 'stellar' },
        { id: 't2', reference: 'txn_ref_b', status: 'BURNED', burnTxHash: '0xhash2', userId: 'user-2', sourceChain: 'base', destinationChain: 'stellar' },
      ]);
      attestationClient.getAttestation
        .mockResolvedValueOnce({ message: '0xdead', attestation: '0xbeef', status: 'complete' })
        .mockResolvedValueOnce({ message: '0xdead2', attestation: '0xbeef2', status: 'complete' });
      stellarService.mintCctpTransfer
        .mockRejectedValueOnce(new Error('rpc down'))
        .mockResolvedValueOnce('mintHash2');
      prisma.bridgeTransfer.update.mockResolvedValue({ status: 'COMPLETED' });

      const result = await service.findAndCompletePendingTransfers();

      expect(result).toEqual({ checked: 2, completed: 1 });
    });
  });

  describe('getStatus', () => {
    it('returns the transfer', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue({ id: 't1', status: 'COMPLETED' });
      await expect(service.getStatus('txn_ref_a')).resolves.toEqual({ id: 't1', status: 'COMPLETED' });
    });

    it('throws NotFoundException for an unknown reference', async () => {
      prisma.bridgeTransfer.findUnique.mockResolvedValue(null);
      await expect(service.getStatus('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUsdcBalanceForAddress', () => {
    it('reads an EVM chain balance via EvmRelayerService', async () => {
      evmRelayer.getUsdcBalance.mockResolvedValue(20_000_000n);

      const result = await service.getUsdcBalanceForAddress('base', '0xADDR');

      expect(result).toEqual({ chain: 'base', address: '0xADDR', balance: '20' });
      expect(evmRelayer.getUsdcBalance).toHaveBeenCalledWith('base', baseChain, '0xADDR');
    });

    it('reads a Stellar balance via StellarService', async () => {
      stellarService.getBalance.mockResolvedValue('15.5000000');

      const result = await service.getUsdcBalanceForAddress('stellar', destination);

      expect(result).toEqual({ chain: 'stellar', address: destination, balance: '15.5000000' });
    });

    it('defaults to 0 when the Stellar account has no USDC trustline', async () => {
      stellarService.getBalance.mockResolvedValue(null);
      const result = await service.getUsdcBalanceForAddress('stellar', destination);
      expect(result.balance).toBe('0');
    });
  });
});
