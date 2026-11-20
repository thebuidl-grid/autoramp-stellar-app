import {
  UnsafeUrlError,
  assertPublicHttpUrl,
  isPrivateAddress,
  safeLookup,
} from './ssrf.util';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '127.8.8.8',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.18.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '2001:db8::1',
    'not-an-ip',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.15.0.1',
    '172.32.0.1',
    '203.0.114.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('treats %s as public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('handles bracketed IPv6', () => {
    expect(isPrivateAddress('[::1]')).toBe(true);
  });
});

describe('assertPublicHttpUrl', () => {
  const publicHost = async () => ['93.184.216.34'];

  it('accepts a public https URL', async () => {
    const url = await assertPublicHttpUrl('https://example.com/hook', {
      resolve: publicHost,
    });
    expect(url.hostname).toBe('example.com');
  });

  it.each([
    ['http://example.com/x', 'must use https'],
    ['ftp://example.com/x', 'must use https'],
    ['file:///etc/passwd', 'must use https'],
    ['javascript:alert(1)', 'must use https'],
    ['https://user:pass@example.com/x', 'credentials'],
    ['not a url', 'Invalid URL'],
    ['https://localhost/x', 'internal host'],
    ['https://foo.localhost/x', 'internal host'],
    ['https://db.internal/x', 'internal host'],
    ['https://printer.local/x', 'internal host'],
    ['https://127.0.0.1/x', 'private address'],
    ['https://169.254.169.254/latest/meta-data/', 'private address'],
    ['https://[::1]/x', 'private address'],
    ['https://[::ffff:127.0.0.1]/x', 'private address'],
    ['https://10.1.2.3:8443/x', 'private address'],
  ])('rejects %s', async (raw, message) => {
    await expect(
      assertPublicHttpUrl(raw, { resolve: publicHost }),
    ).rejects.toThrow(message);
    await expect(
      assertPublicHttpUrl(raw, { resolve: publicHost }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('rejects a public-looking name that resolves to a private address (DNS trick)', async () => {
    await expect(
      assertPublicHttpUrl('https://evil.example.com/x', {
        resolve: async () => ['10.0.0.5'],
      }),
    ).rejects.toThrow('resolves to a private address');
  });

  it('rejects when ANY resolved address is private (multi-record DNS)', async () => {
    await expect(
      assertPublicHttpUrl('https://evil.example.com/x', {
        resolve: async () => ['93.184.216.34', '127.0.0.1'],
      }),
    ).rejects.toThrow('private');
  });

  it('rejects names that do not resolve', async () => {
    await expect(
      assertPublicHttpUrl('https://nope.example.com/x', {
        resolve: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    ).rejects.toThrow('could not be resolved');
    await expect(
      assertPublicHttpUrl('https://nope.example.com/x', {
        resolve: async () => [],
      }),
    ).rejects.toThrow('could not be resolved');
  });

  it('allows http only when asked', async () => {
    await expect(
      assertPublicHttpUrl('http://example.com/x', { resolve: publicHost }),
    ).rejects.toThrow();
    await expect(
      assertPublicHttpUrl('http://example.com/x', {
        allowHttp: true,
        resolve: publicHost,
      }),
    ).resolves.toBeInstanceOf(URL);
  });

  describe('allowedHostSuffixes (the cloudinary.com substring bypass)', () => {
    const opts = {
      allowedHostSuffixes: ['cloudinary.com'],
      resolve: publicHost,
    };

    it('accepts the real host and its subdomains', async () => {
      await expect(
        assertPublicHttpUrl(
          'https://res.cloudinary.com/x/raw/upload/a.pdf',
          opts,
        ),
      ).resolves.toBeInstanceOf(URL);
      await expect(
        assertPublicHttpUrl('https://cloudinary.com/x', opts),
      ).resolves.toBeInstanceOf(URL);
    });

    it.each([
      'https://evil.com/?x=cloudinary.com',
      'https://evil.com/cloudinary.com/x',
      'https://cloudinary.com.evil.com/x',
      'https://evilcloudinary.com/x',
      'https://evil.com#cloudinary.com',
      'https://169.254.169.254/?cloudinary.com',
    ])('rejects %s', async (raw) => {
      await expect(assertPublicHttpUrl(raw, opts)).rejects.toBeInstanceOf(
        UnsafeUrlError,
      );
    });
  });
});

describe('safeLookup (connect-time check, defeats DNS rebinding)', () => {
  const lookup = (host: string, all = false) =>
    new Promise<any>((resolve) =>
      safeLookup(host, { all }, (err, address, family) =>
        resolve({ err, address, family }),
      ),
    );

  it('refuses names that resolve to loopback', async () => {
    const r = await lookup('localhost');
    expect(r.err).toBeTruthy();
    expect(r.err.code).toBe('EUNSAFE');
  });

  it('refuses a literal private IP', async () => {
    const r = await lookup('169.254.169.254');
    expect(r.err?.code).toBe('EUNSAFE');
  });

  it('works with the options-as-callback signature too', async () => {
    const r = await new Promise<any>((resolve) =>
      safeLookup(
        '127.0.0.1',
        ((err: any) => resolve({ err })) as any,
        undefined as any,
      ),
    );
    expect(r.err?.code).toBe('EUNSAFE');
  });
});
