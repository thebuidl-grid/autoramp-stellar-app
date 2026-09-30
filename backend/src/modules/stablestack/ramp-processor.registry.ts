import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { RampProcessor } from './ramp-processor.interface';
import { FlintRampProcessor } from './providers/flint-ramp-processor.service';
import { PaystackRampProcessor } from './providers/paystack-ramp-processor.service';
import { SafeHavenRampProcessor } from './providers/safehaven-ramp-processor.service';

/**
 * Lazily constructs and caches one RampProcessor instance per provider
 * name. Exists because a single global "the active processor" (the old
 * RAMP_PROCESSOR-only model) can't express multi-corridor reality: NG uses
 * SafeHaven and GH uses Paystack *simultaneously*, both live in the same
 * app. Construction stays lazy/per-provider (not "construct everything at
 * boot") so a misconfigured processor only throws when a corridor actually
 * routes to it, not at startup.
 */
@Injectable()
export class RampProcessorRegistry {
  private readonly instances = new Map<string, RampProcessor>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  get(provider: string): RampProcessor {
    const existing = this.instances.get(provider);
    if (existing) return existing;

    const instance = this.construct(provider);
    this.instances.set(provider, instance);
    return instance;
  }

  private construct(provider: string): RampProcessor {
    switch (provider) {
      case 'safehaven':
        return new SafeHavenRampProcessor(this.httpService, this.configService);
      case 'paystack':
        return new PaystackRampProcessor(this.httpService, this.configService);
      case 'flint':
        return new FlintRampProcessor(this.httpService, this.configService);
      default:
        throw new Error(`Unknown ramp processor provider: ${provider}`);
    }
  }
}
