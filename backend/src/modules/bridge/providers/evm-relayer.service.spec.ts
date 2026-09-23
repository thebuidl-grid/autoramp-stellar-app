import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { decodeFunctionData, padHex } from 'viem';
import { EvmRelayerService } from './evm-relayer.service';

const mockPublicClient = {
  readContract: jest.fn(),
  waitForTransactionReceipt: jest.fn(),
};
const mockWalletClient = {
  sendTransaction: jest.fn(),
  writeContract: jest.fn(),
};

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => mockPublicClient),
    createWalletClient: jest.fn(() => mockWalletClient),
  };
});

jest.mock('viem/accounts', () => ({
  privateKeyToAccount: jest.fn((pk: string) => ({ address: `0xADDR_FOR_${pk}` })),
}));

// Mirrors the private ABIs in evm-relayer.service.ts — only what's needed to decode calldata in tests.
const TEST_ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;
const TEST_TOKEN_MESSENGER_ABI = [
  {
    type: 'function',
    name: 'depositForBurnWithHook',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'depositForBurn',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
    ],
    outputs: [{ type: 'uint64' }],
  },
] as const;

describe('EvmRelayerService', () => {
  let service: EvmRelayerService;
  let config: { get: jest.Mock };

  const baseChain = {
    name: 'base',
    usdcAddress: '0xUSDC',
    tokenMessengerAddress: '0xTokenMessenger',
    messageTransmitterAddress: '0xMessageTransmitter',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          BASE_RPC_URL: 'https://base-sepolia.example',
          BASE_RELAYER_PRIVATE_KEY: '0xRELAYERKEY',
          EVM_COLLECTION_GAS_FUNDING_AMOUNT: '0.001',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EvmRelayerService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(EvmRelayerService);
  });

  describe('getUsdcBalance', () => {
    it('reads balanceOf on the chain USDC contract', async () => {
      mockPublicClient.readContract.mockResolvedValue(5_000_000n);
      const result = await service.getUsdcBalance('base', baseChain, '0xADDR');
      expect(result).toBe(5_000_000n);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ address: '0xUSDC', functionName: 'balanceOf', args: ['0xADDR'] }),
      );
    });
  });

  describe('buildDepositForBurnTransactions', () => {
    // encodeFunctionData (unlike the mocked writeContract used elsewhere in
    // this file) really validates address shape, so these need to be
    // well-formed 20-byte hex addresses, not the shorthand `baseChain` uses.
    const evmChain = {
      name: 'base',
      usdcAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      tokenMessengerAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };
    const mintRecipient = padHex('0xaa', { size: 32 });
    const destinationCaller = padHex('0xbb', { size: 32 });

    it('returns unsigned approve + plain depositForBurn calldata when no hook data is given, never signing anything', () => {
      const { approveTx, burnTx } = service.buildDepositForBurnTransactions({
        sourceChain: evmChain as any,
        amount: '10.5',
        destinationDomain: 27,
        mintRecipient: mintRecipient as any,
        destinationCaller: destinationCaller as any,
      });

      expect(approveTx.to).toBe(evmChain.usdcAddress);
      expect(approveTx.value).toBe('0x0');
      // decodeFunctionData returns EIP-55 checksummed addresses regardless
      // of the input casing, so compare case-insensitively.
      const decodedApprove = decodeFunctionData({ abi: TEST_ERC20_ABI, data: approveTx.data });
      expect(decodedApprove.functionName).toBe('approve');
      expect((decodedApprove.args[0] as string).toLowerCase()).toBe(evmChain.tokenMessengerAddress);
      expect(decodedApprove.args[1]).toBe(10_500_000n);

      expect(burnTx.to).toBe(evmChain.tokenMessengerAddress);
      expect(burnTx.value).toBe('0x0');
      // No hookData supplied — must use the plain depositForBurn selector,
      // not depositForBurnWithHook, which reverts on-chain with "Hook data
      // is empty" (verified against circlefin/evm-cctp-contracts).
      const decodedBurn = decodeFunctionData({ abi: TEST_TOKEN_MESSENGER_ABI, data: burnTx.data });
      expect(decodedBurn.functionName).toBe('depositForBurn');
      const [amount, domain, recipient, burnToken, caller, maxFee, minFinality] = decodedBurn.args;
      expect(amount).toBe(10_500_000n);
      expect(domain).toBe(27);
      expect(recipient).toBe(mintRecipient);
      expect((burnToken as string).toLowerCase()).toBe(evmChain.usdcAddress);
      expect(caller).toBe(destinationCaller);
      expect(maxFee).toBe(0n);
      expect(minFinality).toBe(2000);

      // Non-signing — no client/wallet interaction at all.
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
      expect(mockWalletClient.sendTransaction).not.toHaveBeenCalled();
    });

    it('uses depositForBurnWithHook when real hook data is supplied', () => {
      const hookData = padHex('0xcc', { size: 32 });
      const { burnTx } = service.buildDepositForBurnTransactions({
        sourceChain: evmChain as any,
        amount: '10.5',
        destinationDomain: 27,
        mintRecipient: mintRecipient as any,
        destinationCaller: destinationCaller as any,
        hookData: hookData as any,
      });

      const decodedBurn = decodeFunctionData({ abi: TEST_TOKEN_MESSENGER_ABI, data: burnTx.data });
      expect(decodedBurn.functionName).toBe('depositForBurnWithHook');
      expect(decodedBurn.args[7]).toBe(hookData);
    });

    it('throws if the source chain has no tokenMessengerAddress', () => {
      expect(() =>
        service.buildDepositForBurnTransactions({
          sourceChain: { ...evmChain, tokenMessengerAddress: null } as any,
          amount: '1',
          destinationDomain: 27,
          mintRecipient: mintRecipient as any,
          destinationCaller: destinationCaller as any,
        }),
      ).toThrow('tokenMessengerAddress');
    });
  });

  describe('mint', () => {
    it('calls receiveMessage on the destination chain via the relayer wallet', async () => {
      mockWalletClient.writeContract.mockResolvedValue('0xMINTHASH');
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({ status: 'success' });

      const result = await service.mint(baseChain as any, '0xMESSAGE' as any, '0xATTESTATION' as any);

      expect(result).toBe('0xMINTHASH');
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0xMessageTransmitter',
          functionName: 'receiveMessage',
          args: ['0xMESSAGE', '0xATTESTATION'],
        }),
      );
    });
  });

  describe('formatUsdc', () => {
    it('formats raw 6-decimal units into a human string', () => {
      expect(service.formatUsdc(10_500_000n)).toBe('10.5');
    });
  });

  describe('addressToBytes32', () => {
    it('left-pads a 20-byte address into a 32-byte hex value', () => {
      const result = EvmRelayerService.addressToBytes32('0x000000000000000000000000000000000000aa');
      expect(result).toHaveLength(66); // '0x' + 64 hex chars (32 bytes)
      expect(result.endsWith('aa')).toBe(true);
    });
  });
});
