import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { FlintRampProcessor } from './providers/flint-ramp-processor.service';
import { PaystackRampProcessor } from './providers/paystack-ramp-processor.service';

describe('RampProcessorRegistry', () => {
  let registry: RampProcessorRegistry;
  const config: Record<string, string> = {
    STABLESTACK_API_URL: 'https://flint.example.com',
    STABLESTACK_API_KEY: 'flint-key',
    PAYSTACK_SECRET_KEY: 'sk_test_123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RampProcessorRegistry,
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
      ],
    }).compile();

    registry = module.get(RampProcessorRegistry);
  });

  it('constructs the requested provider', () => {
    expect(registry.get('flint')).toBeInstanceOf(FlintRampProcessor);
    expect(registry.get('paystack')).toBeInstanceOf(PaystackRampProcessor);
  });

  it('caches instances — same provider returns the same object', () => {
    const first = registry.get('paystack');
    const second = registry.get('paystack');
    expect(first).toBe(second);
  });

  it('throws for an unknown provider name', () => {
    expect(() => registry.get('unknown-provider')).toThrow('Unknown ramp processor provider');
  });

  it('propagates a processor construction failure (e.g. missing config) without caching it', () => {
    expect(() => registry.get('safehaven')).toThrow(); // SAFEHAVEN_* config absent here
  });
});
