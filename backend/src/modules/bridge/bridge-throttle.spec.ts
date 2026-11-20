import 'reflect-metadata';
// The controller imports the Stellar relay, which pulls in a heavy SDK this test has no use for.
jest.mock('./stellar-relay.service', () => ({ StellarRelayService: class {} }));

import { BridgeController } from './bridge.controller';

/** The website polls /bridge/status every 5 seconds, so it needs more room than the global limits give. */
describe('GET /bridge/status/:reference rate limit', () => {
  const handler = BridgeController.prototype.checkStatus;
  const get = (name: string, key: 'limit' | 'ttl') => Reflect.getMetadata(`THROTTLER:${key.toUpperCase()}${name}`, handler);

  it('allows a 5 second poll for the length of a transfer (12 a minute, 240 per 20 minutes)', () => {
    expect(get('short', 'limit')).toBeGreaterThanOrEqual(12);
    expect(get('medium', 'limit')).toBeGreaterThanOrEqual(240);
    expect(get('long', 'limit')).toBeGreaterThanOrEqual(240);
  });
});
