import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { PrismaService } from '../../database/prisma.service';
import { StellarRelayStore } from './stellar-relay.store';

/** Circle CCTP domain id for Stellar. */
export const STELLAR_CCTP_DOMAIN = 27;

/** Circle's CctpForwarder Soroban contract per network. */
export const STELLAR_CCTP_FORWARDER = {
  testnet: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
  mainnet: 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T',
} as const;

export type RelayStatus = 'pending' | 'minting' | 'complete';
export interface RelayResult {
  status: RelayStatus;
  mintTxHash?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Clients poll every ~5s while a transfer settles; this leaves headroom without allowing abuse. */
const RELAY_REQUESTS_PER_MINUTE = 30;

export interface RelayActor {
  userId?: string;
  merchantId?: string;
}

/**
 * Relays a CCTP burn to Stellar: reads Circle's attestation, then submits
 * CctpForwarder.mint_and_forward. The relayer key (STELLAR_RELAYER_SECRET) only pays fees; the
 * minted USDC goes to the recipient encoded in the burn's hook data. The key lives in the
 * backend env and is never sent to, or reachable from, the frontend.
 */
@Injectable()
export class StellarRelayService {
  private readonly logger = new Logger(StellarRelayService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly store: StellarRelayStore,
  ) {}

  private network(): 'testnet' | 'mainnet' {
    return this.config.get<string>('CCTP_NETWORK') === 'mainnet'
      ? 'mainnet'
      : 'testnet';
  }

  /**
   * The burn must belong to a bridge transfer this caller created through our API (its source
   * hash was recorded via /bridge/update-hash). This stops anyone using the relayer, which pays
   * the Stellar fee, to mint arbitrary outside burns.
   */
  private async ownedTransfer(burnTxHash: string, actor: RelayActor) {
    const owners: Array<{ userId: string } | { merchantId: string }> = [];
    if (actor.userId) owners.push({ userId: actor.userId });
    if (actor.merchantId) owners.push({ merchantId: actor.merchantId });
    if (!owners.length) {
      throw new ForbiddenException('Unknown transfer');
    }
    const transfer = await this.prisma.bridgeTransaction.findFirst({
      where: {
        OR: owners,
        transactionHash: { equals: burnTxHash, mode: 'insensitive' },
      },
    });
    if (!transfer) {
      throw new ForbiddenException(
        'This burn does not belong to one of your bridge transfers. Start the transfer in AutoRamp first.',
      );
    }
    return transfer;
  }

  async relay(
    burnTxHash: string,
    sourceDomain: number,
    actor: RelayActor,
  ): Promise<RelayResult> {
    const key = burnTxHash.toLowerCase();

    const limit = await this.store.hit(
      `${actor.userId ?? actor.merchantId ?? 'anon'}`,
      RELAY_REQUESTS_PER_MINUTE,
      60,
    );
    if (!limit.allowed) {
      throw new HttpException(
        'Too many relay requests. Please wait a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const transfer = await this.ownedTransfer(burnTxHash, actor);

    const recorded = (transfer.metadata as Record<string, any> | null)
      ?.STELLAR_MINT_TX;
    const cached = recorded ?? (await this.store.getMinted(key));
    if (cached) return { status: 'complete', mintTxHash: cached };
    if (await this.store.isLocked(key)) return { status: 'minting' };

    const network = this.network();
    const iris =
      network === 'testnet'
        ? 'https://iris-api-sandbox.circle.com'
        : 'https://iris-api.circle.com';

    let msg:
      | {
          status?: string;
          message?: string;
          attestation?: string;
          decodedMessage?: { destinationDomain?: string };
        }
      | undefined;
    try {
      const r = await fetch(
        `${iris}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`,
        { signal: AbortSignal.timeout(10_000), cache: 'no-store' },
      );
      if (r.ok) msg = ((await r.json()) as any)?.messages?.[0];
    } catch {
      // transient Iris failure: report pending and let the client poll again
    }
    if (!msg || msg.status !== 'complete' || !msg.message || !msg.attestation) {
      return { status: 'pending' };
    }
    // Only relay burns that are actually destined for Stellar.
    if (
      String(msg.decodedMessage?.destinationDomain) !==
      String(STELLAR_CCTP_DOMAIN)
    ) {
      throw new BadRequestException('Burn is not destined for Stellar');
    }

    const secret = this.config.get<string>('STELLAR_RELAYER_SECRET');
    if (!secret) {
      this.logger.error('STELLAR_RELAYER_SECRET is not configured');
      throw new ServiceUnavailableException('Stellar relay is not configured');
    }

    if (!(await this.store.acquireLock(key))) return { status: 'minting' };
    try {
      const mintTxHash = await this.withRetry(() =>
        this.mintAndForward(network, secret, msg!.message!, msg!.attestation!),
      );
      await this.store.setMinted(key, mintTxHash);
      await this.recordMint(transfer.id, transfer.metadata, mintTxHash);
      return { status: 'complete', mintTxHash };
    } catch (e) {
      // First line only: Soroban simulation errors embed a huge diagnostic log.
      const error = (e instanceof Error ? e.message : 'Mint failed')
        .split('\n')[0]
        .slice(0, 200);
      this.logger.warn(`Stellar relay for ${burnTxHash} failed: ${error}`);
      throw new BadGatewayException(error);
    } finally {
      await this.store.releaseLock(key);
    }
  }

  /** Durable proof of the mint on the bridge record (survives a Redis flush). */
  private async recordMint(id: string, metadata: unknown, mintTxHash: string) {
    try {
      await this.prisma.bridgeTransaction.update({
        where: { id },
        data: {
          metadata: {
            ...((metadata as Record<string, any> | null) ?? {}),
            STELLAR_MINT_TX: mintTxHash,
          },
        },
      });
    } catch (e) {
      this.logger.warn(
        `Could not record mint ${mintTxHash} on bridge ${id}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Retry infrastructure hiccups; contract-level rejections (e.g. a replayed message) are final. */
  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        const msg = e instanceof Error ? e.message : '';
        const transient =
          /not found|timeout|timed out|fetch failed|ECONN|ENOTFOUND|\b(429|502|503|504)\b|try again/i.test(
            msg,
          );
        if (!transient || /Contract, #/.test(msg)) throw e;
        await sleep(2000 * (i + 1));
      }
    }
    throw last;
  }

  private async mintAndForward(
    network: 'testnet' | 'mainnet',
    secret: string,
    message: string,
    attestation: string,
  ): Promise<string> {
    const rpcUrl =
      this.config.get<string>('STELLAR_SOROBAN_RPC_URL') ||
      (network === 'testnet' ? 'https://soroban-testnet.stellar.org' : '');
    if (!rpcUrl) throw new Error('Set STELLAR_SOROBAN_RPC_URL for mainnet');

    const kp = Keypair.fromSecret(secret);
    const server = new rpc.Server(rpcUrl);
    const account = await server.getAccount(kp.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: '10000000',
      networkPassphrase:
        network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC,
    })
      .addOperation(
        new Contract(STELLAR_CCTP_FORWARDER[network]).call(
          'mint_and_forward',
          xdr.ScVal.scvBytes(Buffer.from(message.replace(/^0x/, ''), 'hex')),
          xdr.ScVal.scvBytes(
            Buffer.from(attestation.replace(/^0x/, ''), 'hex'),
          ),
        ),
      )
      .setTimeout(120)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Mint simulation failed: ${sim.error}`);
    }
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(kp);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === 'ERROR') {
      throw new Error('Stellar rejected the mint transaction');
    }

    let res = await server.getTransaction(sent.hash);
    for (let i = 0; res.status === 'NOT_FOUND' && i < 45; i++) {
      await sleep(2000);
      res = await server.getTransaction(sent.hash);
    }
    if (res.status !== 'SUCCESS') {
      throw new Error(`Stellar mint failed (${res.status})`);
    }
    return sent.hash;
  }
}
