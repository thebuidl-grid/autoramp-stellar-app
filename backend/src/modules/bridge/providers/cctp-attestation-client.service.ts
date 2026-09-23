import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

const IRIS_SANDBOX_URL = 'https://iris-api-sandbox.circle.com';
const IRIS_MAINNET_URL = 'https://iris-api.circle.com';

export interface CctpAttestation {
  message: string; // hex, "0x"-prefixed
  attestation: string; // hex, "0x"-prefixed
  status: 'pending_confirmations' | 'complete';
}

/**
 * Wraps Circle's Iris attestation service — the piece of CCTP that signs
 * proof a burn happened, so it can be relayed to mint on the destination
 * chain. Docs: https://developers.circle.com/cctp/technical-guide
 * (GET /v2/messages?transactionHash=...).
 */
@Injectable()
export class CctpAttestationClient {
  private readonly logger = new Logger(CctpAttestationClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('CIRCLE_IRIS_API_URL') ||
      (this.configService.get<string>('STELLAR_NETWORK') === 'mainnet' ? IRIS_MAINNET_URL : IRIS_SANDBOX_URL);
  }

  /**
   * Returns the attestation for a burn transaction, or null if it isn't
   * ready yet (still waiting on source-chain confirmations) or genuinely
   * doesn't exist. Never throws for "not ready" — that's the expected,
   * common outcome while polling.
   *
   * `sourceDomain` (the CCTP domain ID the burn happened on, e.g. 6 for
   * Base, 0 for Ethereum, 27 for Stellar) is a required PATH segment on
   * Circle's v2 API — GET /v2/messages/{sourceDomain}?transactionHash=...
   * — not just a query param. Omitting it (as an earlier version of this
   * did, calling plain /v2/messages) 404s outright, which the catch block
   * below treats identically to "not indexed yet", so it looked exactly
   * like an attestation that was merely slow rather than one that could
   * never be found — every burn got stuck at BURNED forever.
   */
  async getAttestation(burnTxHash: string, sourceDomain: number): Promise<CctpAttestation | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/v2/messages/${sourceDomain}`, {
          params: { transactionHash: burnTxHash },
        }),
      );

      const entry = response.data?.messages?.[0];
      if (!entry || entry.status !== 'complete' || !entry.attestation || entry.attestation === 'PENDING') {
        return null;
      }

      return {
        message: entry.message,
        attestation: entry.attestation,
        status: 'complete',
      };
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null; // not indexed yet
      }
      this.logger.warn(
        `Failed to fetch CCTP attestation for ${burnTxHash}: ${(error as any).message}`,
      );
      return null;
    }
  }
}
