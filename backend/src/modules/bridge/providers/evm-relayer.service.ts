import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chain as PrismaChain } from '@prisma/client';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  padHex,
  encodeFunctionData,
  type Hex,
  type Address,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  baseSepolia,
  sepolia,
  base,
  mainnet,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  avalanche,
  avalancheFuji,
} from 'viem/chains';

/**
 * Minimal ERC-20 ABI (approve/balanceOf/decimals) — this is all the bridge
 * flow needs; not a general-purpose token client.
 */
const ERC20_ABI = [
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
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

/**
 * CCTP V2 TokenMessenger — burn side. Shape per Circle's public CCTP V2
 * docs (https://developers.circle.com/cctp/technical-guide); NOT yet
 * verified against the actual deployed/verified contract on Basescan or
 * Etherscan for the addresses in the chain registry — do that before
 * trusting this with real funds, same caveat this codebase already
 * applies to every third-party integration built from docs alone.
 */
const TOKEN_MESSENGER_ABI = [
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

/** CCTP V2 MessageTransmitter — mint/relay side. Same verification caveat as above. */
const MESSAGE_TRANSMITTER_ABI = [
  {
    type: 'function',
    name: 'receiveMessage',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

const VIEM_CHAINS: Record<string, Chain> = {
  base: baseSepolia,
  ethereum: sepolia,
  arbitrum: arbitrumSepolia,
  optimism: optimismSepolia,
  polygon: polygonAmoy,
  avalanche: avalancheFuji,
  // Swap these in for mainnet once STELLAR_NETWORK=mainnet-equivalent
  // bridge config exists — kept here so the mapping stays one place.
};
const VIEM_CHAINS_MAINNET: Record<string, Chain> = {
  base,
  ethereum: mainnet,
  arbitrum,
  optimism,
  polygon,
  avalanche,
};

/**
 * EVM half of the CCTP bridge — everything Stellar's side already does
 * (StellarService.mintCctpTransfer, buildCctpBurnTransaction) but for
 * Base/Ethereum. Non-custodial on the burn (source) side, same as Stellar:
 * `buildDepositForBurnTransactions` only encodes unsigned calldata for the
 * caller's own wallet to submit — no private key or user funds ever touch
 * this service on the way out. The chain's persistent RELAYER wallet (env:
 * <CHAIN>_RELAYER_PRIVATE_KEY) is only used on the destination side, to pay
 * its own gas submitting mints (receiveMessage) — CCTP mints are
 * permissionless-by-design, so a relayer doing that isn't a custody concern.
 */
@Injectable()
export class EvmRelayerService {
  private readonly logger = new Logger(EvmRelayerService.name);

  constructor(private readonly configService: ConfigService) {}

  private isMainnet(): boolean {
    return this.configService.get<string>('STELLAR_NETWORK') === 'mainnet';
  }

  private viemChain(chainName: string) {
    const map = this.isMainnet() ? VIEM_CHAINS_MAINNET : VIEM_CHAINS;
    const chain = map[chainName];
    if (!chain) {
      throw new BadRequestException(`EvmRelayerService has no viem chain mapping for "${chainName}"`);
    }
    return chain;
  }

  private rpcUrl(chainName: string): string {
    const key = `${chainName.toUpperCase()}_RPC_URL`;
    const url = this.configService.get<string>(key);
    if (!url) {
      throw new BadRequestException(`${key} missing in config`);
    }
    return url;
  }

  private relayerPrivateKey(chainName: string): Hex {
    const key = `${chainName.toUpperCase()}_RELAYER_PRIVATE_KEY`;
    const pk = this.configService.get<string>(key);
    if (!pk) {
      throw new BadRequestException(`${key} missing in config`);
    }
    return (pk.startsWith('0x') ? pk : `0x${pk}`) as Hex;
  }

  private publicClient(chainName: string) {
    return createPublicClient({ chain: this.viemChain(chainName), transport: http(this.rpcUrl(chainName)) });
  }

  private walletClient(chainName: string, privateKey: Hex) {
    return createWalletClient({
      account: privateKeyToAccount(privateKey),
      chain: this.viemChain(chainName),
      transport: http(this.rpcUrl(chainName)),
    });
  }

  async getUsdcBalance(chainName: string, chain: Pick<PrismaChain, 'usdcAddress'>, address: Address): Promise<bigint> {
    const client = this.publicClient(chainName);
    return client.readContract({
      address: chain.usdcAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
  }

  /**
   * Builds a standalone unsigned ERC-20 approve transaction — the source-
   * token leg of the multi-stablecoin bridge-in flow (approve a non-USDC
   * token to 0x's allowance target before ZeroXSwapQuoteService's swap
   * calldata) needs this same shape but a different token/spender/amount
   * than buildDepositForBurnTransactions' USDC-specific approve, and (unlike
   * USDC, which is 6 decimals on every CCTP chain) the token's decimals
   * aren't a safe assumption — DAI, for one, is 18.
   */
  buildErc20ApproveTransaction(params: { tokenAddress: Address; spender: Address; amount: string; decimals: number }): {
    to: Address;
    data: Hex;
    value: Hex;
  } {
    const amount = parseUnits(params.amount, params.decimals);
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [params.spender, amount],
    });
    return { to: params.tokenAddress, data, value: '0x0' };
  }

  /**
   * Builds unsigned approve + depositForBurn(WithHook) calldata for the
   * caller's own wallet to submit (self-custodial — mirrors
   * StellarService.buildCctpBurnTransaction). Two separate transactions
   * because CCTP's depositForBurn doesn't pull an allowance itself;
   * ERC-20 approve has to land first and can't be batched into the same
   * call without EIP-5792, which we don't require here.
   *
   * Uses plain `depositForBurn` unless real hook data is supplied —
   * `depositForBurnWithHook` reverts with "Hook data is empty" otherwise
   * (verified against circlefin/evm-cctp-contracts' TokenMessengerV2.sol),
   * mirroring the same non-empty-hookData requirement on the Stellar side's
   * `deposit_for_burn_with_hook`.
   */
  buildDepositForBurnTransactions(params: {
    sourceChain: PrismaChain;
    amount: string; // human units, e.g. "10.5"
    destinationDomain: number;
    mintRecipient: Hex; // bytes32, left-padded address or Stellar hook target
    destinationCaller: Hex; // bytes32
    hookData?: Hex;
  }): {
    approveTx: { to: Address; data: Hex; value: Hex };
    burnTx: { to: Address; data: Hex; value: Hex };
  } {
    if (!params.sourceChain.tokenMessengerAddress) {
      throw new BadRequestException(`Chain ${params.sourceChain.name} is missing tokenMessengerAddress`);
    }
    const usdcAmount = parseUnits(params.amount, 6); // USDC is 6 decimals on every CCTP chain

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [params.sourceChain.tokenMessengerAddress as Address, usdcAmount],
    });

    const hasHookData = !!params.hookData && params.hookData !== '0x';
    const burnData = hasHookData
      ? encodeFunctionData({
          abi: TOKEN_MESSENGER_ABI,
          functionName: 'depositForBurnWithHook',
          args: [
            usdcAmount,
            params.destinationDomain,
            params.mintRecipient,
            params.sourceChain.usdcAddress as Address,
            params.destinationCaller,
            0n, // maxFee — 0 = standard (slower, cheaper) transfer, not Fast Transfer
            2000, // minFinalityThreshold — Circle's documented "Standard" threshold
            params.hookData as Hex,
          ],
        })
      : encodeFunctionData({
          abi: TOKEN_MESSENGER_ABI,
          functionName: 'depositForBurn',
          args: [
            usdcAmount,
            params.destinationDomain,
            params.mintRecipient,
            params.sourceChain.usdcAddress as Address,
            params.destinationCaller,
            0n, // maxFee — 0 = standard (slower, cheaper) transfer, not Fast Transfer
            2000, // minFinalityThreshold — Circle's documented "Standard" threshold
          ],
        });

    return {
      approveTx: { to: params.sourceChain.usdcAddress as Address, data: approveData, value: '0x0' },
      burnTx: { to: params.sourceChain.tokenMessengerAddress as Address, data: burnData, value: '0x0' },
    };
  }

  /**
   * Relays a mint on an EVM destination chain — the EVM counterpart to
   * StellarService.mintCctpTransfer. Paid for by the chain's own
   * persistent relayer wallet; mints straight to whatever mintRecipient
   * was encoded in the original burn (no forwarder-contract trick needed
   * on EVM, unlike Soroban).
   */
  async mint(destinationChain: PrismaChain, message: Hex, attestation: Hex): Promise<Hex> {
    if (!destinationChain.messageTransmitterAddress) {
      throw new BadRequestException(`Chain ${destinationChain.name} is missing messageTransmitterAddress`);
    }
    const relayerKey = this.relayerPrivateKey(destinationChain.name);
    const wallet = this.walletClient(destinationChain.name, relayerKey);
    const publicClient = this.publicClient(destinationChain.name);

    const mintHash = await wallet.writeContract({
      address: destinationChain.messageTransmitterAddress as Address,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: 'receiveMessage',
      args: [message, attestation],
      chain: this.viemChain(destinationChain.name),
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    this.logger.log(`Minted on ${destinationChain.name}: ${mintHash}`);
    return mintHash;
  }

  /** Left-pads a 20-byte EVM address into CCTP's bytes32 recipient format. */
  static addressToBytes32(address: Address): Hex {
    return padHex(address, { size: 32 });
  }

  formatUsdc(rawAmount: bigint): string {
    return formatUnits(rawAmount, 6);
  }
}
