import 'reflect-metadata';
import { AdminGuard } from '../../modules/auth/guards/admin.guard';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { AnalyticsController } from '../../modules/analytics/analytics.controller';
import { BlockRadarController } from '../../modules/blockradar/blockradar.controller';
import { CloudinaryController } from '../../modules/cloudinary/cloudinary.controller';

const classGuards = (c: any): unknown[] =>
  Reflect.getMetadata('__guards__', c) ?? [];
const methodGuards = (c: any, m: string): unknown[] =>
  Reflect.getMetadata('__guards__', c.prototype[m]) ?? [];

/**
 * These controllers were reachable without logging in. They move money, expose business data or
 * touch KYC documents, so the guards must stay on them.
 */
describe('endpoints that must not be public', () => {
  it('GET /data (business analytics) requires an admin login', () => {
    expect(classGuards(AnalyticsController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, AdminGuard]),
    );
  });

  it('every /blockradar route (wallet withdrawals, sweeps, fiat payouts) requires an admin login', () => {
    expect(classGuards(BlockRadarController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, AdminGuard]),
    );
  });

  it('/uploads requires a login, and KYC document proxy/signing is admin only', () => {
    expect(classGuards(CloudinaryController)).toContain(JwtAuthGuard);
    expect(methodGuards(CloudinaryController, 'proxyDocument')).toContain(
      AdminGuard,
    );
    expect(methodGuards(CloudinaryController, 'getSignedUrl')).toContain(
      AdminGuard,
    );
  });

  it('no route in these controllers is marked @Public', () => {
    for (const c of [
      AnalyticsController,
      BlockRadarController,
      CloudinaryController,
    ]) {
      expect(Reflect.getMetadata('isPublic', c)).toBeUndefined();
      for (const name of Object.getOwnPropertyNames(c.prototype)) {
        if (name === 'constructor') continue;
        expect(
          Reflect.getMetadata('isPublic', c.prototype[name]),
        ).toBeUndefined();
      }
    }
  });
});
