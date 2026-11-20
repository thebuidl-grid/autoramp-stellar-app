import { createHmac, randomBytes } from 'crypto';

/**
 * Standalone Bitnob API key tester.
 *
 * Verifies a Bitnob client id + secret against /api/whoami (and a read-only
 * banks call). Replicates the backend's HMAC-SHA256 auth header scheme.
 *
 * Usage:
 *   BITNOB_CLIENT_ID=... BITNOB_KEY=... \
 *     npx ts-node -r tsconfig-paths/register scripts/test-bitnob-key.ts
 *
 * Or via flags:
 *   npx ts-node -r tsconfig-paths/register scripts/test-bitnob-key.ts \
 *     --client-id=... --key=... [--url=https://api.bitnob.com]
 */

interface Cfg {
  clientId: string;
  key: string;
  baseUrl: string;
}

function parseArgs(): Cfg {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length) : undefined;
  };

  const clientId = (flag('client-id') || process.env.BITNOB_CLIENT_ID || '').trim();
  const key = (
    flag('key') || process.env.BITNOB_KEY || process.env.BITNOB_API_KEY || ''
  ).trim();
  const baseUrl = (
    flag('url') ||
    process.env.BITNOB_API_URL ||
    'https://api.bitnob.com'
  ).replace(/\/+$/, '');

  if (!clientId || !key) {
    console.error(
      'Missing client id or key.\n' +
        'Usage: BITNOB_CLIENT_ID=... BITNOB_KEY=... ' +
        'npx ts-node -r tsconfig-paths/register scripts/test-bitnob-key.ts\n' +
        '   or: npx ts-node -r tsconfig-paths/register scripts/test-bitnob-key.ts ' +
        '--client-id=... --key=... [--url=https://api.bitnob.com]',
    );
    process.exit(1);
  }

  return { clientId, key, baseUrl };
}

function buildHeaders(
  clientId: string,
  key: string,
  body?: string,
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const payload = `${clientId}:${timestamp}:${nonce}:${body ?? ''}`;
  const signature = createHmac('sha256', key).update(payload).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Auth-Client': clientId,
    'X-Auth-Timestamp': timestamp,
    'X-Auth-Nonce': nonce,
    'X-Auth-Signature': signature,
  };
}

async function call(
  cfg: Cfg,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: any }> {
  const rawBody = body ? JSON.stringify(body) : undefined;
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: buildHeaders(cfg.clientId, cfg.key, rawBody),
    body: rawBody,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, data };
}

async function main() {
  const cfg = parseArgs();
  console.log(
    `Testing Bitnob key — client ${cfg.clientId.slice(0, 8)}… @ ${cfg.baseUrl}\n`,
  );

  // 1. whoami — canonical auth check
  console.log('1) POST /api/whoami');
  const who = await call(cfg, 'POST', '/api/whoami', {});
  console.log(`   status = ${who.status}`);
  console.log(`   response = ${JSON.stringify(who.data).slice(0, 600)}`);
  console.log('');

  // 2. banks — read-only data endpoint (also proves payout scope access)
  console.log('2) GET /api/payouts/banks?country=NG');
  const banks = await call(cfg, 'GET', '/api/payouts/banks?country=NG');
  const bankCount = Array.isArray(banks.data?.data) ? banks.data.data.length : 0;
  console.log(`   status = ${banks.status}`);
  console.log(`   banks returned = ${bankCount}`);
  console.log('');

  // Summary
  console.log('=== RESULT ===');
  if (who.status === 403) {
    console.log(
      'FAIL: 403 Forbidden — the egress IP is not whitelisted in the Bitnob dashboard.',
    );
  } else if (who.status === 401 || who.status === 400) {
    console.log(
      'FAIL: authentication error — bad client id / key (or invalid signature).',
    );
  } else if (who.status >= 200 && who.status < 300) {
    console.log('OK: key authenticated successfully.');
  } else {
    console.log(`UNEXPECTED: whoami status = ${who.status}`);
  }
}

main().catch((err) => {
  console.error('Script failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
