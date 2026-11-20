import { relayLegFields } from './cctp-relay-leg';
import { PayoutOrderRepository } from './payout-order.repository';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { PrismaService } from '../../database/prisma.service';
import {
  BurnPlan,
  CCTP_DOMAIN_BASE,
  CCTP_DOMAIN_STELLAR,
  CCTP_FAST_FINALITY,
  isStellarOfframpRelayEnabled,
  parseCctpV2BurnMessage,
  planStellarBurn,
} from './cctp-stellar-relay.util';

/** Circle's CCTP v2 MessageTransmitterV2 (same address on every EVM chain, per network). */
export const MESSAGE_TRANSMITTER_V2 = {
  testnet: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  mainnet: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
} as const;

const TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
  'function usedNonces(bytes32) view returns (uint256)',
];

type Net = 'testnet' | 'mainnet';

export type RelayState = 'awaiting_burn' | 'attesting' | 'minting' | 'minted';
export interface RelayResult {
  reference: string;
  state: RelayState;
  mintTxHash?: string;
  message: string;
}

/** A claim older than this with no mint hash is considered abandoned and may be retaken. */
const CLAIM_TTL_SECONDS = 180;

/**
 * Stellar off-ramp over CCTP + Base.
 *
 *   1. Bitnob payout is opened on BASE (not Stellar) -> Bitnob's Base deposit address.
 *   2. The user's Stellar wallet burns USDC (fast CCTP) with that address as the mint recipient. The user never
 *      sees or types the address: the backend hands the wallet the exact burn parameters.
 *   3. This service reads Circle's attestation and calls MessageTransmitterV2.receiveMessage on Base from the
 *      relayer wallet (it pays the Base gas), minting the USDC to Bitnob, which then pays the NGN.
 */
@Injectable()
export class StellarOfframpRelayService {
  private readonly logger = new Logger(StellarOfframpRelayService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly payoutOrders: PayoutOrderRepository,
  ) {}

  isEnabled(): boolean {
    return isStellarOfframpRelayEnabled(this.config);
  }

  /**
   * Default network for relayed off-ramps. Real payouts come from live Bitnob, so this is MAINNET unless
   * STELLAR_OFFRAMP_NETWORK=testnet; deliberately independent of CCTP_NETWORK (testnet by default, for the bridge demo).
   */
  defaultNetwork(): Net {
    return this.config.get<string>('STELLAR_OFFRAMP_NETWORK') === 'testnet'
      ? 'testnet'
      : 'mainnet';
  }

  /** The network a new order runs on: the client's toggle when it sent one, else the server default. */
  resolveNetwork(requested?: string | null): Net {
    return requested === 'testnet' || requested === 'mainnet'
      ? requested
      : this.defaultNetwork();
  }

  private irisBase(network: Net): string {
    return network === 'mainnet'
      ? 'https://iris-api.circle.com'
      : 'https://iris-api-sandbox.circle.com';
  }

  private rpcUrl(network: Net): string {
    const override = this.config.get<string>('BASE_RELAYER_RPC_URL')?.trim();
    // An explicit override is for mainnet; testnet orders always use the public Sepolia RPC.
    if (override && network === 'mainnet') return override;
    return network === 'mainnet'
      ? this.config.get<string>('CCTP_DESTINATION_RPC_URL')?.trim() ||
          'https://mainnet.base.org'
      : 'https://sepolia.base.org';
  }

  /** Circle's quoted fast-transfer fee (basis points) for Stellar -> Base; falls back to a conservative 2 bps. */
  async fastFeeBps(network: Net = this.defaultNetwork()): Promise<number> {
    try {
      const res = await fetch(
        `${this.irisBase(network)}/v2/burn/USDC/fees/${CCTP_DOMAIN_STELLAR}/${CCTP_DOMAIN_BASE}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const tiers = (await res.json()) as Array<{
          finalityThreshold: number;
          minimumFee: number;
        }>;
        const fast = tiers.find(
          (t) => t.finalityThreshold === CCTP_FAST_FINALITY,
        );
        if (fast && Number.isFinite(Number(fast.minimumFee)))
          return Number(fast.minimumFee);
      }
    } catch (error: any) {
      this.logger.warn(
        `Circle fee lookup failed, using fallback: ${error?.message}`,
      );
    }
    return 2;
  }

  /** Burn parameters for an order whose Bitnob payout needs `amountToPay` USDC on Base. */
  async planBurn(
    amountToPay: string | number,
    network: Net = this.defaultNetwork(),
  ): Promise<BurnPlan> {
    return planStellarBurn(amountToPay, await this.fastFeeBps(network));
  }

  /** What the frontend needs to build the burn. Never contains anything the user can change. */
  bridgeInstructions(
    mintRecipient: string,
    plan: BurnPlan,
    network: Net = this.defaultNetwork(),
  ) {
    return {
      via: 'cctp',
      sourceChain: 'stellar',
      destinationChain: 'base',
      sourceDomain: CCTP_DOMAIN_STELLAR,
      destinationDomain: CCTP_DOMAIN_BASE,
      mintRecipient,
      burnAmountUnits: plan.burnAmountUnits,
      burnAmount: plan.burnAmount,
      maxFeeUnits: plan.maxFeeUnits,
      finality: 'fast',
      finalityThreshold: CCTP_FAST_FINALITY,
      network,
    };
  }

  /** Relay (or report on) the mint for a user's off-ramp order. Safe to call repeatedly. */
  async relay(reference: string, userId: string): Promise<RelayResult> {
    const order = await this.payoutOrders.findByReference(reference);
    const tx: any = order?.offrampTransactionId
      ? await this.prisma.offrampTransaction.findFirst({
          where: { id: order.offrampTransactionId, userId },
        })
      : null;
    if (!order || !tx) throw new NotFoundException('Offramp order not found');

    const meta = (tx.metadata ?? {}) as any;
    const relay = meta.cctpRelay;
    if (!relay?.mintRecipient)
      throw new BadRequestException('This order does not use the CCTP relay');
    const done = (
      state: RelayState,
      message: string,
      mintTxHash?: string,
    ): RelayResult => ({
      reference,
      state,
      message,
      ...(mintTxHash ? { mintTxHash } : {}),
    });

    if (relay.status === 'minted')
      return done(
        'minted',
        'USDC already delivered to the payout provider.',
        relay.mintTxHash,
      );
    const burnHash: string | undefined = meta.stellarTxHash;
    if (!burnHash)
      return done(
        'awaiting_burn',
        'Waiting for the Stellar burn to be confirmed.',
      );
    if (!this.isEnabled())
      throw new ServiceUnavailableException('Relay is not configured');
    // The network this order was created for (the client's toggle at creation time).
    const network: Net = relay.network === 'testnet' ? 'testnet' : 'mainnet';

    // 1. Circle attestation
    const att = await this.fetchAttestation(burnHash, network);
    if (!att) return done('attesting', "Waiting for Circle's attestation.");

    // 2. The burn must target exactly this order's Bitnob deposit address, Stellar -> Base.
    const parsed = parseCctpV2BurnMessage(att.message);
    if (
      parsed.sourceDomain !== CCTP_DOMAIN_STELLAR ||
      parsed.destinationDomain !== CCTP_DOMAIN_BASE ||
      parsed.mintRecipient !== String(relay.mintRecipient).toLowerCase()
    ) {
      this.logger.error(
        `[relay] burn ${burnHash} does not match order ${reference}; refusing to mint`,
      );
      await this.patchRelay(tx.id, {
        status: 'rejected',
        error: 'Burn does not match this order',
      });
      throw new BadRequestException('Burn does not match this order');
    }

    // 3. One relayer at a time per order.
    if (!(await this.claim(tx.id)))
      return done('minting', 'Mint already in progress.');

    try {
      const wallet = new Wallet(
        this.config.get<string>('BASE_RELAYER_PRIVATE_KEY')!.trim(),
        new JsonRpcProvider(this.rpcUrl(network)),
      );
      const transmitter = new Contract(
        MESSAGE_TRANSMITTER_V2[network],
        TRANSMITTER_ABI,
        wallet,
      );

      // Someone (e.g. Circle) may already have minted it: permissionless, and the funds go to Bitnob either way.
      if ((await transmitter.usedNonces(parsed.nonce)) !== 0n) {
        await this.patchRelay(tx.id, {
          status: 'minted',
          mintedAt: new Date().toISOString(),
          mintedBy: 'third-party',
        });
        return done('minted', 'USDC already delivered to the payout provider.');
      }

      const sent = await transmitter.receiveMessage(
        att.message,
        att.attestation,
      );
      await this.patchRelay(tx.id, {
        status: 'minting',
        mintTxHash: sent.hash,
      });
      const receipt = await sent.wait(1);
      if (!receipt || receipt.status !== 1)
        throw new Error(`Mint transaction ${sent.hash} reverted`);

      await this.patchRelay(tx.id, {
        status: 'minted',
        mintTxHash: sent.hash,
        mintedAt: new Date().toISOString(),
      });
      this.logger.log(`[relay] minted ${reference} on Base: ${sent.hash}`);
      return done(
        'minted',
        'USDC delivered to the payout provider.',
        sent.hash,
      );
    } catch (error: any) {
      await this.releaseClaim(tx.id, error?.message ?? 'relay failed');
      const msg = String(error?.message ?? '');
      if (/insufficient funds|gas/i.test(msg)) {
        this.logger.error(`[relay] relayer wallet is out of Base gas: ${msg}`);
        throw new ServiceUnavailableException(
          'Relayer is out of gas. Please try again shortly.',
        );
      }
      this.logger.error(`[relay] mint failed for ${reference}: ${msg}`);
      throw new HttpException(
        'Mint failed; it will be retried.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async fetchAttestation(
    burnHash: string,
    network: Net,
  ): Promise<{ message: string; attestation: string } | null> {
    try {
      const res = await fetch(
        `${this.irisBase(network)}/v2/messages/${CCTP_DOMAIN_STELLAR}?transactionHash=${encodeURIComponent(burnHash)}`,
        { signal: AbortSignal.timeout(10_000), cache: 'no-store' },
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

  /** Atomic claim: first caller wins; a stale claim (no mint hash after the TTL) can be retaken. */
  private async claim(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    const claimed = await this.prisma.$executeRaw`
      UPDATE offramp_transactions
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cctpRelay,claimedAt}', to_jsonb(${now}::text), true)
      WHERE id = ${id}::uuid
        AND (metadata->'cctpRelay'->>'status') IS DISTINCT FROM 'minted'
        AND ((metadata->'cctpRelay'->>'claimedAt') IS NULL
             OR (metadata->'cctpRelay'->>'claimedAt')::timestamptz < now() - make_interval(secs => ${CLAIM_TTL_SECONDS}::double precision))`;
    return claimed > 0;
  }

  private async releaseClaim(id: string, error: string) {
    await this.prisma.$executeRaw`
      UPDATE offramp_transactions
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cctpRelay,claimedAt}', 'null'::jsonb, true)
      WHERE id = ${id}::uuid`;
    await this.patchRelay(id, { lastError: error });
  }

  private async patchRelay(id: string, patch: Record<string, unknown>) {
    const row = await this.prisma.offrampTransaction.findUnique({
      where: { id },
      select: { metadata: true, reference: true },
    });
    const meta = ((row?.metadata as any) ?? {}) as Record<string, any>;
    const next = { ...meta, cctpRelay: { ...(meta.cctpRelay ?? {}), ...patch } };
    await this.prisma.offrampTransaction.update({
      where: { id },
      data: { metadata: next as any },
    });
    // Keep the CCTP record in step with the relay. A failure to record must never break the relay itself.
    try {
      const fields = relayLegFields(row?.reference ?? '', next);
      if (fields) await this.payoutOrders.recordRelayLeg(id, fields);
    } catch (e) {
      this.logger.warn(`[relay] could not record the CCTP leg for ${row?.reference}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
