import {
  countryFromVirtualAccountReference,
  resolveCountry,
  virtualAccountReference,
} from './bitnob-countries';

describe('bitnob-countries', () => {
  it('defaults to NG and is case-insensitive', () => {
    expect(resolveCountry().currency).toBe('NGN');
    expect(resolveCountry('gh').currency).toBe('GHS');
    expect(resolveCountry('KE').currency).toBe('KES');
  });

  it('rejects unsupported countries', () => {
    expect(() => resolveCountry('US')).toThrow(/Unsupported country/);
  });

  it('keeps the legacy NG virtual account reference', () => {
    expect(virtualAccountReference('bitnob_user_1', 'NG')).toBe(
      'bitnob_user_1',
    );
    expect(virtualAccountReference('bitnob_user_1', 'GH')).toBe(
      'bitnob_user_1_GH',
    );
  });

  it('derives country from a virtual account reference', () => {
    expect(countryFromVirtualAccountReference('bitnob_user_1_KE').code).toBe(
      'KE',
    );
    expect(countryFromVirtualAccountReference('bitnob_user_1').code).toBe('NG');
  });
});
