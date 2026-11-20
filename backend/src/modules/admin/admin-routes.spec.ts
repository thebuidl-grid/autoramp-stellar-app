import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { TransactionsController } from './transactions/transactions.controller';
import { AdminTrackerController, AdminWebhooksController } from './tracker/admin-tracker.controller';
import { AdminBitnobController } from './bitnob/admin-bitnob.controller';
import { AdminCctpController, AdminSafehavenController } from './safehaven/admin-safehaven.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * The admin API's route table. Controllers sit under the `admin` prefix (and `admin/transactions` for the transactions
 * ones, see RouterModule in app.module.ts). Two things must never regress:
 *   1. one handler per method+path (a duplicate silently lets registration order pick the winner), and
 *   2. every admin route is behind JwtAuthGuard + AdminGuard.
 */
const CONTROLLERS: Array<{ ctrl: any; prefix: string }> = [
  { ctrl: AdminController, prefix: '/admin' },
  { ctrl: TransactionsController, prefix: '/admin/transactions' },
  { ctrl: AdminTrackerController, prefix: '/admin' },
  { ctrl: AdminWebhooksController, prefix: '/admin' },
  { ctrl: AdminBitnobController, prefix: '/admin' },
  { ctrl: AdminSafehavenController, prefix: '/admin' },
  { ctrl: AdminCctpController, prefix: '/admin' },
];

function routesOf(ctrl: any, prefix: string) {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '').replace(/^\/|\/$/g, '');
  return Object.getOwnPropertyNames(ctrl.prototype)
    .filter((name) => name !== 'constructor' && Reflect.hasMetadata(METHOD_METADATA, ctrl.prototype[name]))
    .map((name) => {
      const handler = ctrl.prototype[name];
      const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '').replace(/^\/|\/$/g, '');
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      const full = [prefix, base, path].filter(Boolean).join('/').replace(/\/+/g, '/');
      return { method, path: full, name, ctrl };
    });
}

const ALL = CONTROLLERS.flatMap(({ ctrl, prefix }) => routesOf(ctrl, prefix));
// :param segments of the same shape are the same route
const key = (r: { method: string; path: string }) => `${r.method} ${r.path.replace(/:[^/]+/g, ':p')}`;

describe('admin route table', () => {
  it('finds the routes (guards against the reflection going quiet)', () => {
    expect(ALL.length).toBeGreaterThan(20);
  });

  it('has exactly one handler per method and path', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const r of ALL) {
      const k = key(r);
      if (seen.has(k)) dupes.push(`${k} (${seen.get(k)} and ${r.ctrl.name}.${r.name})`);
      else seen.set(k, `${r.ctrl.name}.${r.name}`);
    }
    expect(dupes).toEqual([]);
  });

  it('puts every admin controller behind JwtAuthGuard and AdminGuard', () => {
    for (const { ctrl } of CONTROLLERS) {
      const guards: any[] = Reflect.getMetadata('__guards__', ctrl) ?? [];
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, AdminGuard]));
    }
  });

  it('keeps the routes the admin console calls', () => {
    const have = new Set(ALL.map(key));
    for (const k of [
      'GET /admin/users',
      'GET /admin/merchants/:p/bank-account',
      'GET /admin/platform-transactions',
      'GET /admin/transactions/summary',
      'GET /admin/transactions/analytics',
      'GET /admin/transfer-logs',
      'GET /admin/otc/transactions',
      'GET /admin/audit-logs',
      'GET /admin/transactions/stuck',
      'GET /admin/transactions/failed',
      'GET /admin/transactions/attention',
      'GET /admin/transactions/:p/trace',
      'GET /admin/safehaven/accounts',
      'GET /admin/safehaven/accounts/:p',
      'GET /admin/safehaven/transactions',
      'GET /admin/cctp/transactions',
      'GET /admin/webhooks',
      'GET /admin/webhooks/:p',
    ]) {
      expect(have).toContain(k);
    }
  });

  it('no longer serves the dead API-key admin routes', () => {
    const paths = ALL.map((r) => r.path);
    expect(paths.filter((p) => p.includes('api-keys'))).toEqual([]);
  });
});
