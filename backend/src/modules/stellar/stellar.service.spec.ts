import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Asset, Keypair } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

// Only the network I/O surface (Horizon.Server) is mocked — Asset,
// TransactionBuilder, Operation, Memo, Keypair are real, so the XDR the
// service builds is genuinely exercised, not just assumed correct.
const mockLoadAccount = jest.fn();
const mockSubmitTransaction = jest.fn();
const mockStrictSendPathsCall = jest.fn();
const mockPaymentsCall = jest.fn();
const mockTransactionCall = jest.fn();

// Soroban RPC mocks (mintCctpTransfer, executeCctpBurnFromDistribution) —
// separate from Horizon above.
const mockRpcGetAccount = jest.fn();
const mockRpcPrepareTransaction = jest.fn();
const mockRpcSendTransaction = jest.fn();
const mockRpcPollTransaction = jest.fn();
const mockRpcGetLatestLedger = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: mockLoadAccount,
        submitTransaction: mockSubmitTransaction,
        strictSendPaths: jest.fn().mockReturnValue({ call: mockStrictSendPathsCall }),
        payments: jest.fn().mockReturnValue({
          forAccount: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({ call: mockPaymentsCall }),
            }),
          }),
        }),
        transactions: jest.fn().mockReturnValue({
          transaction: jest.fn().mockReturnValue({ call: mockTransactionCall }),
        }),
      })),
    },
    rpc: {
      ...actual.rpc,
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockRpcGetAccount,
        prepareTransaction: mockRpcPrepareTransaction,
        sendTransaction: mockRpcSendTransaction,
        pollTransaction: mockRpcPollTransaction,
        getLatestLedger: mockRpcGetLatestLedger,
      })),
    },
  };
});

function mockAccount(publicKey: string, sequence = '100', balances: any[] = []) {
  let seq = BigInt(sequence);
  return {
    accountId: () => publicKey,
    sequenceNumber: () => seq.toString(),
    incrementSequenceNumber: () => {
      seq += 1n;
    },
    balances,
  };
}

describe('StellarService', () => {
  let service: StellarService;
  const cngnAsset = new Asset('CNGN', Keypair.random().publicKey());
  const usdcAsset = new Asset('USDC', Keypair.random().publicKey());
  const userKeypair = Keypair.random();
  const destinationKeypair = Keypair.random();
  const distributionKeypair = Keypair.random();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STELLAR_DISTRIBUTION_SECRET') return distributionKeypair.secret();
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  describe('getBalance', () => {
    it('returns the balance line matching the asset code/issuer', async () => {
      mockLoadAccount.mockResolvedValue(
        mockAccount(userKeypair.publicKey(), '1', [
          { asset_type: 'credit_alphanum4', asset_code: 'CNGN', asset_issuer: cngnAsset.getIssuer(), balance: '250.0000000' },
          { asset_type: 'native', balance: '10.0000000' },
        ]),
      );

      const balance = await service.getBalance(userKeypair.publicKey(), cngnAsset);
      expect(balance).toBe('250.0000000');
    });

    it('returns null when the account has no trustline for the asset', async () => {
      mockLoadAccount.mockResolvedValue(mockAccount(userKeypair.publicKey(), '1', []));

      const balance = await service.getBalance(userKeypair.publicKey(), cngnAsset);
      expect(balance).toBeNull();
    });

    it('wraps Horizon errors in a BadRequestException', async () => {
      mockLoadAccount.mockRejectedValue(new Error('account not found'));

      await expect(service.getBalance(userKeypair.publicKey(), cngnAsset)).rejects.toThrow(
        'Failed to fetch balance',
      );
    });
  });

  describe('hasTrustline', () => {
    it('is always true for the native asset', async () => {
      await expect(service.hasTrustline(userKeypair.publicKey(), Asset.native())).resolves.toBe(true);
      expect(mockLoadAccount).not.toHaveBeenCalled();
    });

    it('reflects whether a balance line exists for a non-native asset', async () => {
      mockLoadAccount.mockResolvedValue(
        mockAccount(userKeypair.publicKey(), '1', [
          { asset_type: 'credit_alphanum4', asset_code: 'CNGN', asset_issuer: cngnAsset.getIssuer(), balance: '0' },
        ]),
      );
      await expect(service.hasTrustline(userKeypair.publicKey(), cngnAsset)).resolves.toBe(true);
      await expect(service.hasTrustline(userKeypair.publicKey(), usdcAsset)).resolves.toBe(false);
    });
  });

  describe('getStrictSendQuote', () => {
    it('returns the best path from strictSendPaths', async () => {
      mockStrictSendPathsCall.mockResolvedValue({
        records: [
          {
            source_amount: '100.0000000',
            destination_amount: '161900.0000000',
            path: [],
          },
        ],
      });

      const quote = await service.getStrictSendQuote(usdcAsset, '100', cngnAsset);
      expect(quote.sourceAmount).toBe('100.0000000');
      expect(quote.destinationAmount).toBe('161900.0000000');
    });

    it('throws when no payment path exists', async () => {
      mockStrictSendPathsCall.mockResolvedValue({ records: [] });

      await expect(service.getStrictSendQuote(usdcAsset, '100', cngnAsset)).rejects.toThrow(
        'Failed to get swap quote',
      );
    });
  });

  describe('buildPathPaymentTransaction', () => {
    it('builds a signable XDR containing a path payment op and memo', async () => {
      mockLoadAccount.mockResolvedValue(mockAccount(userKeypair.publicKey(), '5'));

      const result = await service.buildPathPaymentTransaction({
        sourcePublicKey: userKeypair.publicKey(),
        sendAsset: usdcAsset,
        sendAmount: '100',
        destAsset: cngnAsset,
        destMin: '150000',
        destination: destinationKeypair.publicKey(),
        memo: 'txn_ref_abc123',
      });

      expect(result.xdr).toEqual(expect.any(String));
      expect(result.xdr.length).toBeGreaterThan(0);
      expect(result.networkPassphrase).toEqual(expect.any(String));

      // Round-trip: the built XDR should be a well-formed, signable transaction
      const { TransactionBuilder } = jest.requireActual('@stellar/stellar-sdk');
      const tx = TransactionBuilder.fromXDR(result.xdr, result.networkPassphrase);
      expect(tx.operations).toHaveLength(1);
      expect(tx.operations[0].type).toBe('pathPaymentStrictSend');
      expect(tx.memo.value.toString()).toBe('txn_ref_abc123');
    });
  });

  describe('buildSponsoredTrustlineTransaction', () => {
    it('sources the transaction from the user account and pre-signs the sponsoring op with the distribution key', async () => {
      mockLoadAccount.mockResolvedValue(mockAccount(userKeypair.publicKey(), '42'));

      const result = await service.buildSponsoredTrustlineTransaction({
        userPublicKey: userKeypair.publicKey(),
        asset: cngnAsset,
      });

      // Loaded the USER's account (their sequence number) — not the
      // distribution account — so concurrent requests never collide.
      expect(mockLoadAccount).toHaveBeenCalledWith(userKeypair.publicKey());

      const { TransactionBuilder } = jest.requireActual('@stellar/stellar-sdk');
      const tx = TransactionBuilder.fromXDR(result.xdr, result.networkPassphrase);

      expect(tx.source).toBe(userKeypair.publicKey());
      expect(tx.operations.map((op: any) => op.type)).toEqual([
        'beginSponsoringFutureReserves',
        'changeTrust',
        'endSponsoringFutureReserves',
      ]);
      expect(tx.operations[0].source).toBe(distributionKeypair.publicKey());
      expect(tx.operations[0].sponsoredId).toBe(userKeypair.publicKey());

      // Already partially signed by the distribution account
      expect(tx.signatures.length).toBeGreaterThan(0);
    });

    it('throws if the distribution secret is not configured', async () => {
      const moduleWithoutSecret: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        ],
      }).compile();
      const unconfigured = moduleWithoutSecret.get<StellarService>(StellarService);

      await expect(
        unconfigured.buildSponsoredTrustlineTransaction({
          userPublicKey: userKeypair.publicKey(),
          asset: cngnAsset,
        }),
      ).rejects.toThrow('STELLAR_DISTRIBUTION_SECRET is required');
    });
  });

  describe('sendFromDistribution', () => {
    it('signs and submits a payment from the distribution account', async () => {
      mockLoadAccount.mockResolvedValue(mockAccount(distributionKeypair.publicKey(), '9'));
      mockSubmitTransaction.mockResolvedValue({ hash: 'deadbeef', successful: true });

      const hash = await service.sendFromDistribution({
        asset: cngnAsset,
        amount: '10000',
        destination: destinationKeypair.publicKey(),
        memo: 'txn_ref_onramp1',
      });

      expect(hash).toBe('deadbeef');
      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
      // The submitted transaction should already be signed by the distribution key
      const submittedTx = mockSubmitTransaction.mock.calls[0][0];
      expect(submittedTx.signatures.length).toBeGreaterThan(0);
    });

    it('throws if the distribution secret is not configured', async () => {
      const moduleWithoutSecret: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        ],
      }).compile();
      const unconfigured = moduleWithoutSecret.get<StellarService>(StellarService);

      await expect(
        unconfigured.sendFromDistribution({
          asset: cngnAsset,
          amount: '10',
          destination: destinationKeypair.publicKey(),
        }),
      ).rejects.toThrow('STELLAR_DISTRIBUTION_SECRET is required');
    });
  });

  describe('swapFromDistribution', () => {
    it('signs and submits a path payment sourced and destined at the distribution account', async () => {
      mockLoadAccount.mockResolvedValue(mockAccount(distributionKeypair.publicKey(), '3'));
      mockSubmitTransaction.mockResolvedValue({ hash: 'swaphash1', successful: true });

      const hash = await service.swapFromDistribution({
        sendAsset: cngnAsset,
        sendAmount: '1000',
        destAsset: usdcAsset,
        destMin: '0.5',
      });

      expect(hash).toBe('swaphash1');
      const submittedTx = mockSubmitTransaction.mock.calls[0][0];
      expect(submittedTx.operations).toHaveLength(1);
      expect(submittedTx.operations[0].type).toBe('pathPaymentStrictSend');
      // Both source and destination of the swap are the distribution
      // account itself — it's converting an asset it already holds, not
      // paying anyone else.
      expect(submittedTx.operations[0].destination).toBe(distributionKeypair.publicKey());
      expect(submittedTx.source).toBe(distributionKeypair.publicKey());
      expect(submittedTx.signatures.length).toBeGreaterThan(0);
    });

    it('throws if the distribution secret is not configured', async () => {
      const moduleWithoutSecret: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        ],
      }).compile();
      const unconfigured = moduleWithoutSecret.get<StellarService>(StellarService);

      await expect(
        unconfigured.swapFromDistribution({
          sendAsset: cngnAsset,
          sendAmount: '1000',
          destAsset: usdcAsset,
          destMin: '0.5',
        }),
      ).rejects.toThrow('STELLAR_DISTRIBUTION_SECRET is required');
    });
  });

  describe('executeCctpBurnFromDistribution', () => {
    const tokenMessengerAddress = 'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP';
    const usdcContractAddress = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

    async function buildWithSorobanConfig(overrides: Record<string, string | undefined> = {}) {
      const config: Record<string, string | undefined> = {
        STELLAR_DISTRIBUTION_SECRET: distributionKeypair.secret(),
        STELLAR_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
        ...overrides,
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
        ],
      }).compile();
      return module.get<StellarService>(StellarService);
    }

    it('signs and submits approve then burn, both from the distribution account, returning the burn hash', async () => {
      const custodialService = await buildWithSorobanConfig();
      mockRpcGetAccount.mockResolvedValue(mockAccount(distributionKeypair.publicKey(), '11'));
      mockRpcGetLatestLedger.mockResolvedValue({ sequence: 1000 });
      mockRpcPrepareTransaction.mockImplementation((tx: any) => Promise.resolve(tx));
      mockRpcSendTransaction
        .mockResolvedValueOnce({ status: 'PENDING', hash: 'approveHash1' })
        .mockResolvedValueOnce({ status: 'PENDING', hash: 'burnHash1' });
      mockRpcPollTransaction.mockResolvedValue({ status: 'SUCCESS' });

      const hash = await custodialService.executeCctpBurnFromDistribution({
        tokenMessengerAddress,
        usdcContractAddress,
        amount: '10.5',
        destinationDomain: 6,
        mintRecipient: Buffer.alloc(32, 1),
        destinationCaller: Buffer.alloc(32, 0),
      });

      // The burn's hash (second call), not the approve's.
      expect(hash).toBe('burnHash1');
      expect(mockRpcSendTransaction).toHaveBeenCalledTimes(2);
      expect(mockRpcGetAccount).toHaveBeenCalledTimes(2);
      expect(mockRpcGetAccount).toHaveBeenCalledWith(distributionKeypair.publicKey());

      const approveTx = mockRpcPrepareTransaction.mock.calls[0][0];
      expect(approveTx.operations[0].type).toBe('invokeHostFunction');

      const burnTx = mockRpcPrepareTransaction.mock.calls[1][0];
      expect(burnTx.operations[0].type).toBe('invokeHostFunction');

      // Both signed by the distribution key, not any end-user key.
      expect(approveTx.signatures.length).toBeGreaterThan(0);
      expect(burnTx.signatures.length).toBeGreaterThan(0);
    });

    it('uses deposit_for_burn_with_hook when hookData is provided', async () => {
      const custodialService = await buildWithSorobanConfig();
      mockRpcGetAccount.mockResolvedValue(mockAccount(distributionKeypair.publicKey(), '11'));
      mockRpcGetLatestLedger.mockResolvedValue({ sequence: 1000 });
      mockRpcPrepareTransaction.mockImplementation((tx: any) => Promise.resolve(tx));
      mockRpcSendTransaction
        .mockResolvedValueOnce({ status: 'PENDING', hash: 'approveHash2' })
        .mockResolvedValueOnce({ status: 'PENDING', hash: 'burnHash2' });
      mockRpcPollTransaction.mockResolvedValue({ status: 'SUCCESS' });

      await custodialService.executeCctpBurnFromDistribution({
        tokenMessengerAddress,
        usdcContractAddress,
        amount: '1',
        destinationDomain: 27,
        mintRecipient: Buffer.alloc(32, 2),
        destinationCaller: Buffer.alloc(32, 2),
        hookData: Buffer.from('deadbeef', 'hex'),
      });

      const burnTx = mockRpcPrepareTransaction.mock.calls[1][0];
      // deposit_for_burn_with_hook takes one more arg (hook_data) than
      // deposit_for_burn — verified via the host function's arg count
      // rather than a name (invokeHostFunction ops don't expose the
      // called function name directly on the parsed operation).
      const hostFn = burnTx.operations[0].func.value();
      expect(hostFn.args()).toHaveLength(9);
    });

    it('throws if the distribution secret is not configured', async () => {
      const unconfigured = await buildWithSorobanConfig({ STELLAR_DISTRIBUTION_SECRET: undefined });
      await expect(
        unconfigured.executeCctpBurnFromDistribution({
          tokenMessengerAddress,
          usdcContractAddress,
          amount: '1',
          destinationDomain: 6,
          mintRecipient: Buffer.alloc(32),
          destinationCaller: Buffer.alloc(32),
        }),
      ).rejects.toThrow('STELLAR_DISTRIBUTION_SECRET is required');
    });

    it('throws if the Soroban RPC URL is not configured', async () => {
      const unconfigured = await buildWithSorobanConfig({ STELLAR_SOROBAN_RPC_URL: undefined });
      await expect(
        unconfigured.executeCctpBurnFromDistribution({
          tokenMessengerAddress,
          usdcContractAddress,
          amount: '1',
          destinationDomain: 6,
          mintRecipient: Buffer.alloc(32),
          destinationCaller: Buffer.alloc(32),
        }),
      ).rejects.toThrow('STELLAR_SOROBAN_RPC_URL is required');
    });

    it('throws when the burn transaction does not succeed', async () => {
      const custodialService = await buildWithSorobanConfig();
      mockRpcGetAccount.mockResolvedValue(mockAccount(distributionKeypair.publicKey(), '11'));
      mockRpcGetLatestLedger.mockResolvedValue({ sequence: 1000 });
      mockRpcPrepareTransaction.mockImplementation((tx: any) => Promise.resolve(tx));
      mockRpcSendTransaction
        .mockResolvedValueOnce({ status: 'PENDING', hash: 'approveHash3' })
        .mockResolvedValueOnce({ status: 'PENDING', hash: 'burnHash3' });
      mockRpcPollTransaction
        .mockResolvedValueOnce({ status: 'SUCCESS' }) // approve succeeds
        .mockResolvedValueOnce({ status: 'FAILED' }); // burn fails

      await expect(
        custodialService.executeCctpBurnFromDistribution({
          tokenMessengerAddress,
          usdcContractAddress,
          amount: '1',
          destinationDomain: 6,
          mintRecipient: Buffer.alloc(32),
          destinationCaller: Buffer.alloc(32),
        }),
      ).rejects.toThrow('Failed to execute CCTP burn');
    });
  });

  describe('getTransactionByHash', () => {
    it('returns success status for a found transaction', async () => {
      mockTransactionCall.mockResolvedValue({ successful: true });
      await expect(service.getTransactionByHash('deadbeef')).resolves.toEqual({ successful: true });
    });

    it('returns null instead of throwing when the transaction cannot be found', async () => {
      mockTransactionCall.mockRejectedValue(new Error('not found'));
      await expect(service.getTransactionByHash('missing')).resolves.toBeNull();
    });
  });

  describe('mintCctpTransfer', () => {
    const relayerKeypair = Keypair.random();
    const cctpForwarderAddress = 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ';

    async function buildWithSorobanConfig(overrides: Record<string, string | undefined> = {}) {
      const config: Record<string, string | undefined> = {
        STELLAR_BRIDGE_RELAYER_SECRET: relayerKeypair.secret(),
        STELLAR_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
        ...overrides,
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
        ],
      }).compile();
      return module.get<StellarService>(StellarService);
    }

    it('builds, signs, and submits a mint_and_forward Soroban invocation', async () => {
      const relayerService = await buildWithSorobanConfig();
      mockRpcGetAccount.mockResolvedValue(mockAccount(relayerKeypair.publicKey(), '7'));
      // prepareTransaction (simulate+assemble) — return the tx unchanged, it's already real
      mockRpcPrepareTransaction.mockImplementation((tx: any) => Promise.resolve(tx));
      mockRpcSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'cctpMintHash1' });
      mockRpcPollTransaction.mockResolvedValue({ status: 'SUCCESS' });

      const hash = await relayerService.mintCctpTransfer({
        cctpForwarderAddress,
        message: Buffer.from('deadbeef', 'hex'),
        attestation: Buffer.from('cafebabe', 'hex'),
      });

      expect(hash).toBe('cctpMintHash1');
      expect(mockRpcGetAccount).toHaveBeenCalledWith(relayerKeypair.publicKey());
      // The prepared transaction should already be signed by the relayer key
      const preparedTx = mockRpcPrepareTransaction.mock.calls[0][0];
      expect(preparedTx.operations).toHaveLength(1);
      expect(preparedTx.operations[0].type).toBe('invokeHostFunction');
    });

    it('throws if the relayer secret is not configured', async () => {
      const unconfigured = await buildWithSorobanConfig({ STELLAR_BRIDGE_RELAYER_SECRET: undefined });
      await expect(
        unconfigured.mintCctpTransfer({
          cctpForwarderAddress,
          message: Buffer.from('dead', 'hex'),
          attestation: Buffer.from('beef', 'hex'),
        }),
      ).rejects.toThrow('STELLAR_BRIDGE_RELAYER_SECRET is required');
    });

    it('throws if the Soroban RPC URL is not configured', async () => {
      const unconfigured = await buildWithSorobanConfig({ STELLAR_SOROBAN_RPC_URL: undefined });
      await expect(
        unconfigured.mintCctpTransfer({
          cctpForwarderAddress,
          message: Buffer.from('dead', 'hex'),
          attestation: Buffer.from('beef', 'hex'),
        }),
      ).rejects.toThrow('STELLAR_SOROBAN_RPC_URL is required');
    });

    it('throws when the mint transaction does not succeed', async () => {
      const relayerService = await buildWithSorobanConfig();
      mockRpcGetAccount.mockResolvedValue(mockAccount(relayerKeypair.publicKey(), '7'));
      mockRpcPrepareTransaction.mockImplementation((tx: any) => Promise.resolve(tx));
      mockRpcSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'cctpMintHash2' });
      mockRpcPollTransaction.mockResolvedValue({ status: 'FAILED' });

      await expect(
        relayerService.mintCctpTransfer({
          cctpForwarderAddress,
          message: Buffer.from('deadbeef', 'hex'),
          attestation: Buffer.from('cafebabe', 'hex'),
        }),
      ).rejects.toThrow('Failed to mint CCTP transfer');
    });
  });

  describe('findIncomingPaymentByMemo', () => {
    it('matches a payment by asset and transaction memo', async () => {
      const collectionAccount = distributionKeypair.publicKey();
      mockPaymentsCall.mockResolvedValue({
        records: [
          {
            type: 'payment',
            to: collectionAccount,
            asset_code: 'CNGN',
            asset_issuer: cngnAsset.getIssuer(),
            amount: '500.0000000',
            transaction_hash: 'txhash1',
            transaction: () => Promise.resolve({ memo: 'txn_ref_offramp1' }),
          },
          {
            type: 'payment',
            to: collectionAccount,
            asset_code: 'CNGN',
            asset_issuer: cngnAsset.getIssuer(),
            amount: '999.0000000',
            transaction_hash: 'txhash2',
            transaction: () => Promise.resolve({ memo: 'some_other_ref' }),
          },
        ],
      });

      const found = await service.findIncomingPaymentByMemo(
        collectionAccount,
        'txn_ref_offramp1',
        cngnAsset,
      );

      expect(found).toEqual({ amount: '500.0000000', transactionHash: 'txhash1' });
    });

    it('returns null when no payment matches the memo', async () => {
      mockPaymentsCall.mockResolvedValue({ records: [] });

      const found = await service.findIncomingPaymentByMemo(
        distributionKeypair.publicKey(),
        'txn_ref_missing',
        cngnAsset,
      );

      expect(found).toBeNull();
    });
  });
});
