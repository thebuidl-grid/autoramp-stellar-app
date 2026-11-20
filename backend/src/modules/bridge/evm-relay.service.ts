import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { PrismaService } from '../../database/prisma.service';
import {
  CCTP_DOMAIN_BASE,
  CCTP_DOMAIN_STELLAR,
  parseCctpV2BurnMessage,
} from '../ramp/cctp-stellar-relay.util';
import { MESSAGE_TRANSMITTER_V2 } from '../ramp/stellar-offramp-relay.service';
import { StellarRelayStore } from './stellar-relay.store';
import type { RelayActor, RelayResult } from './stellar-relay.service';

const TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
  'function usedNonces(bytes32) view returns (uint256)',
];

type Net = 'testnet' | 'mainnet';
const ZERO_BYTES32 = '0'.repeat(64);

/** Stellar -> Base bridge transfers only: the burn is on Stellar, the mint is on Base. */
export function isStellarToBase(fromChain: string, toChain: string): boolean {
  return /stellar/i.test(fromChain) && /^base(_|$)/i.test(toChain);
}

/** The network follows the chain names ("Base_Sepolia", "Stellar_Testnet" are test networks). */
export function networkOf(fromChain: string, toChain: string): Net {
  return /sepolia|testnet|devnet/i.test(`${fromChain} ${toChain}`)
    ? 'testnet'
    : 'mainnet';
}

/** The 20-byte address a burn message mints to, as 0x-lowercase. */
export const normalizeAddress = (a: string) => a.trim().toLowerCase();

/** destinationCaller sits at bytes 76..108 of the CCTP v2 message header; all zero means anyone may submit the mint. */
export function destinationCallerOf(messageHex: string): string {
  const hex = messageHex.startsWith('0x') ? messageHex.slice(2) : messageHex;
  return hex.slice(76 * 2, 108 * 2).toLowerCase();
}

/**
 * Finishes a Stellar -> Base CCTP transfer when the user's own wallet did not: reads Circle's attestation, then calls
 * MessageTransmitterV2.receiveMessage on Base from the relayer wallet. The relayer only pays gas; the USDC is minted to the
 * recipient encoded in the burn, and we refuse any burn that does not target the transfer's own destination address.
 * Minting is permissionless, so this can never take funds, only deliver them.
 */
@Injectable()
export class EvmRelayService {
  private readonly logger = new Logger(EvmRelayService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly store: StellarRelayStore,
  ) {}

  private irisBase(network: Net) {
    return network === 'mainnet'
      ? 'https://iris-api.circle.com'
      : 'https://iris-api-sandbox.circle.com';
  }

  private rpcUrl(network: Net): string {
    const override = this.config.get<string>('BASE_RELAYER_RPC_URL')?.trim();
    if (override && network === 'mainnet') return override;
    return network === 'mainnet'
      ? this.config.get<string>('CCTP_DESTINATION_RPC_URL')?.trim() ||
          'https://mainnet.base.org'
      : 'https://sepolia.base.org';
  }

  /** Same rule as the Stellar relay: the burn must be one of the caller's own recorded bridge transfers. */
  private async ownedTransfer(burnTxHash: string, actor: RelayActor) {
    const owners: Array<{ userId: string } | { merchantId: string }> = [];
    if (actor.userId) owners.push({ userId: actor.userId });
    if (actor.merchantId) owners.push({ merchantId: actor.merchantId });
    if (!owners.length) throw new ForbiddenException('Unknown transfer');
    const bare = burnTxHash.replace(/^0x/i, '');
    const transfer = await this.prisma.bridgeTransaction.findFirst({
      where: {
        OR: owners,
        transactionHash: {
          in: [bare, `0x${bare}`, bare.toUpperCase()],
          mode: 'insensitive',
        } as any,
      },
    });
    if (!transfer) {
      throw new ForbiddenException(
        'This burn does not belong to one of your bridge transfers. Start the transfer in AutoRamp first.',
      );
    }
    return transfer;
  }

  /** Relay one of the caller's own transfers. */
  async relay(burnTxHash: string, actor: RelayActor): Promise<RelayResult> {
    const transfer = await this.ownedTransfer(burnTxHash, actor);
    return this.relayTransfer(transfer);
  }

  /** Relay an already-authorised transfer (the endpoint checked ownership; the sweeper reads the rows itself). */
  async relayTransfer(transfer: any): Promise<RelayResult> {
    if (!isStellarToBase(transfer.fromChain, transfer.toChain)) {
      throw new BadRequestException(
        'Only Stellar to Base transfers can be relayed here',
      );
    }
    const network = networkOf(transfer.fromChain, transfer.toChain);
    const burnHash = String(transfer.transactionHash ?? '').replace(/^0x/i, '');
    if (!burnHash)
      throw new BadRequestException('This transfer has no burn recorded yet');
    const key = burnHash.toLowerCase();

    const meta = (transfer.metadata ?? {}) as Record<string, any>;
    const done = meta.EVM_MINT_TX ?? (await this.store.getMinted(key));
    if (done) return { status: 'complete', mintTxHash: done };
    if (await this.store.isLocked(key)) return { status: 'minting' };

    const att = await this.fetchAttestation(burnHash, network);
    if (!att) return { status: 'pending' };

    const parsed = parseCctpV2BurnMessage(att.message);
    if (
      parsed.sourceDomain !== CCTP_DOMAIN_STELLAR ||
      parsed.destinationDomain !== CCTP_DOMAIN_BASE
    ) {
      throw new BadRequestException('Burn is not a Stellar to Base transfer');
    }
    if (
      parsed.mintRecipient !== normalizeAddress(transfer.destinationAddress)
    ) {
      this.logger.error(
        `[evm-relay] burn ${burnHash} mints to ${parsed.mintRecipient}, not ${transfer.destinationAddress}; refusing`,
      );
      throw new BadRequestException('Burn does not match this transfer');
    }

    const secret = this.config.get<string>('BASE_RELAYER_PRIVATE_KEY')?.trim();
    if (!secret)
      throw new ServiceUnavailableException('Base relay is not configured');
    const wallet = new Wallet(
      secret,
      new JsonRpcProvider(this.rpcUrl(network)),
    );
    const caller = destinationCallerOf(att.message);
    if (
      caller !== ZERO_BYTES32 &&
      !caller.endsWith(wallet.address.slice(2).toLowerCase())
    ) {
      throw new BadRequestException(
        'This burn can only be minted by a specific caller',
      );
    }

    if (!(await this.store.acquireLock(key))) return { status: 'minting' };
    try {
      const transmitter = new Contract(
        MESSAGE_TRANSMITTER_V2[network],
        TRANSMITTER_ABI,
        wallet,
      );
      // The user's wallet (or Circle) may have minted it already.
      if ((await transmitter.usedNonces(parsed.nonce)) !== 0n) {
        await this.recordMint(transfer, null, 'third-party');
        return { status: 'complete' };
      }
      const sent = await transmitter.receiveMessage(
        att.message,
        att.attestation,
      );
      const receipt = await sent.wait(1);
      if (!receipt || receipt.status !== 1)
        throw new Error(`Mint transaction ${sent.hash} reverted`);
      await this.store.setMinted(key, sent.hash);
      await this.recordMint(transfer, sent.hash, 'relayer');
      return { status: 'complete', mintTxHash: sent.hash };
    } catch (e) {
      const error = (e instanceof Error ? e.message : 'Mint failed')
        .split('\n')[0]
        .slice(0, 200);
      this.logger.warn(`[evm-relay] ${burnHash} failed: ${error}`);
      throw new BadGatewayException(error);
    } finally {
      await this.store.releaseLock(key);
    }
  }

  private async fetchAttestation(
    burnHash: string,
    network: Net,
  ): Promise<{ message: string; attestation: string } | null> {
    try {
      const res = await fetch(
        `${this.irisBase(network)}/v2/messages/${CCTP_DOMAIN_STELLAR}?transactionHash=${encodeURIComponent(burnHash)}`,
        {
          signal: AbortSignal.timeout(10_000),
          cache: 'no-store',
        },
      );
      if (!res.ok) return null;
      const m = ((await res.json()) as any)?.messages?.[0];
      return m?.status === 'complete' && m.message && m.attestation
        ? { message: m.message, attestation: m.attestation }
        : null;
    } catch {
      return null;
    }
  }

  /** Durable proof on the bridge record, and the transfer is delivered. */
  private async recordMint(
    transfer: any,
    mintTxHash: string | null,
    by: 'relayer' | 'third-party',
  ) {
    try {
      await this.prisma.bridgeTransaction.update({
        where: { id: transfer.id },
        data: {
          status: 'COMPLETED',
          metadata: {
            ...((transfer.metadata as Record<string, any> | null) ?? {}),
            ...(mintTxHash
              ? { EVM_MINT_TX: mintTxHash, DESTINATION_TX: mintTxHash }
              : { EVM_MINT_TX: 'third-party' }),
            EVM_MINTED_BY: by,
          },
        },
      });
    } catch (e) {
      this.logger.warn(
        `Could not record the mint on bridge ${transfer.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
