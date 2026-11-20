import { promises as dnsPromises, lookup as dnsLookup } from 'dns';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { isIP } from 'net';

/** Thrown when a URL must not be fetched (private target, bad scheme, credentials in URL, ...). */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

/** Expands any valid IPv6 text form (including "::" and a dotted IPv4 tail) to 8 hextets. */
function parseIPv6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);

  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    text =
      text.slice(0, lastColon + 1) +
      ((v4[0] << 8) | v4[1]).toString(16) +
      ':' +
      ((v4[2] << 8) | v4[3]).toString(16);
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [
    ...head,
    ...Array(halves.length === 2 ? missing : 0).fill('0'),
    ...rest,
  ];
  if (groups.length !== 8) return null;
  const out = groups.map((g) =>
    /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN,
  );
  return out.every((n) => Number.isFinite(n)) ? out : null;
}

function isPrivateIPv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "this" network
    a === 10 || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // documentation
    (a === 192 && b === 88 && c === 99) || // 6to4 relay
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast, reserved, broadcast
  );
}

/** True for loopback, private, link-local, multicast, reserved and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  const kind = isIP(ip);
  if (kind === 4) {
    const v4 = parseIPv4(ip);
    return v4 ? isPrivateIPv4(v4) : true;
  }
  if (kind === 6) {
    const g = parseIPv6(ip);
    if (!g) return true; // unparseable: refuse
    const embedded = (hi: number, lo: number) => [
      hi >> 8,
      hi & 255,
      lo >> 8,
      lo & 255,
    ];
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff)
      return isPrivateIPv4(embedded(g[6], g[7])); // IPv4-mapped ::ffff:a.b.c.d
    if (g.slice(0, 6).every((x) => x === 0))
      return isPrivateIPv4(embedded(g[6], g[7])); // IPv4-compatible
    if (g[0] === 0x64 && g[1] === 0xff9b)
      return isPrivateIPv4(embedded(g[6], g[7])); // NAT64
    if (g[0] === 0x2002) return isPrivateIPv4(embedded(g[1], g[2])); // 6to4
    if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
    if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
    if ((g[0] & 0xff00) === 0xff00) return true; // multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    return false;
  }
  return true; // not an IP at all
}

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
];

export interface SafeUrlOptions {
  /** Allow plain http (default false: https only). */
  allowHttp?: boolean;
  /** If set, the hostname must equal one of these or be a subdomain of one. */
  allowedHostSuffixes?: string[];
  /** Resolver, injectable for tests. Defaults to DNS lookup of all A/AAAA records. */
  resolve?: (hostname: string) => Promise<string[]>;
  /**
   * Skip resolving the hostname (literal IPs and internal names are still rejected). Use outside
   * production only, e.g. offline tests; the connect-time check in {@link safeLookup} still applies.
   */
  skipDns?: boolean;
}

const defaultResolve = async (hostname: string): Promise<string[]> =>
  (await dnsPromises.lookup(hostname, { all: true })).map((r) => r.address);

/**
 * Validates that `raw` is an http(s) URL pointing at the public internet: no credentials in the
 * URL, no localhost/internal names, and every address the name resolves to is public. Throws
 * UnsafeUrlError otherwise. Pair it with {@link createSsrfSafeAgents} on the actual request so
 * the address is checked again at connect time (DNS rebinding).
 */
export async function assertPublicHttpUrl(
  raw: string,
  options: SafeUrlOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  const allowed = options.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowed.includes(url.protocol)) {
    throw new UnsafeUrlError(
      options.allowHttp ? 'URL must use http or https' : 'URL must use https',
    );
  }
  if (url.username || url.password)
    throw new UnsafeUrlError('URL must not contain credentials');

  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) throw new UnsafeUrlError('URL has no host');

  if (options.allowedHostSuffixes?.length) {
    const ok = options.allowedHostSuffixes.some(
      (s) => host === s || host.endsWith(`.${s}`),
    );
    if (!ok) throw new UnsafeUrlError('URL host is not allowed');
  }

  if (isIP(host)) {
    if (isPrivateAddress(host))
      throw new UnsafeUrlError('URL points to a private address');
    return url;
  }
  if (
    host === 'localhost' ||
    BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    throw new UnsafeUrlError('URL points to an internal host');
  }

  if (options.skipDns) return url;

  let addresses: string[];
  try {
    addresses = await (options.resolve ?? defaultResolve)(host);
  } catch {
    throw new UnsafeUrlError('URL host could not be resolved');
  }
  if (addresses.length === 0)
    throw new UnsafeUrlError('URL host could not be resolved');
  if (addresses.some(isPrivateAddress)) {
    throw new UnsafeUrlError('URL resolves to a private address');
  }
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: any,
  family?: number,
) => void;

/** A `lookup` for http(s) agents that refuses private addresses at connect time. */
export function safeLookup(
  hostname: string,
  options: any,
  callback: LookupCallback,
): void {
  const opts = typeof options === 'function' ? {} : (options ?? {});
  const cb: LookupCallback = typeof options === 'function' ? options : callback;
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as unknown as { address: string; family: number }[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || list.length === 0) {
      const e: NodeJS.ErrnoException = new UnsafeUrlError(
        'Blocked request to a private address',
      );
      e.code = 'EUNSAFE';
      return cb(e);
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

/** http/https agents whose connections can only go to public addresses. */
export function createSsrfSafeAgents(): {
  httpAgent: HttpAgent;
  httpsAgent: HttpsAgent;
} {
  return {
    httpAgent: new HttpAgent({ lookup: safeLookup as any }),
    httpsAgent: new HttpsAgent({ lookup: safeLookup as any }),
  };
}
