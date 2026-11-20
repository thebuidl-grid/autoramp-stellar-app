import { HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, loginAttemptLimiter } from './auth.service';

// Wrap bcrypt.compare so tests can count how much password work each login does.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt');
  return { ...actual, compare: jest.fn(actual.compare) };
});

describe('AuthService login hardening', () => {
  let svc: AuthService;
  let prisma: any;
  const compare = bcrypt.compare as unknown as jest.Mock;
  const pw = 'correct horse battery';
  const hash = bcrypt.hashSync(pw, 4);

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      admin: { findUnique: jest.fn() },
    };
    const jwt = { sign: jest.fn().mockReturnValue('jwt') };
    svc = new AuthService(
      prisma,
      jwt as any,
      { get: jest.fn() } as any,
      {} as any,
    );
    compare.mockClear();
    for (const e of ['a@x.co', 'admin@x.co', 'ghost@x.co']) {
      loginAttemptLimiter.reset(`user:${e}`);
      loginAttemptLimiter.reset(`admin:${e}`);
    }
  });

  describe('user sign-in', () => {
    const user = (over: Record<string, unknown> = {}) => ({
      id: 'u1',
      email: 'a@x.co',
      role: 'USER',
      password: hash,
      suspended: false,
      ...over,
    });

    it('signs in with the right password', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      const res = await svc.signIn({ email: 'a@x.co', password: pw } as any);
      expect(res.accessToken).toBe('jwt');
      expect(res.user).not.toHaveProperty('password');
    });

    it('does the same bcrypt work and gives the same error for unknown accounts and wrong passwords', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        svc.signIn({ email: 'ghost@x.co', password: 'whatever' } as any),
      ).rejects.toThrow('Invalid email or password');
      expect(compare).toHaveBeenCalledTimes(1);

      compare.mockClear();
      prisma.user.findUnique.mockResolvedValue(user());
      await expect(
        svc.signIn({ email: 'a@x.co', password: 'wrong' } as any),
      ).rejects.toThrow('Invalid email or password');
      expect(compare).toHaveBeenCalledTimes(1);
    });

    it('does not reveal that an account is OTP-only (no password) or suspended to someone without the password', async () => {
      prisma.user.findUnique.mockResolvedValue(user({ password: '' }));
      await expect(
        svc.signIn({ email: 'a@x.co', password: 'x' } as any),
      ).rejects.toThrow('Invalid email or password');
      expect(compare).toHaveBeenCalledTimes(1);

      prisma.user.findUnique.mockResolvedValue(user({ suspended: true }));
      await expect(
        svc.signIn({ email: 'a@x.co', password: 'wrong' } as any),
      ).rejects.toThrow('Invalid email or password');
    });

    it('tells the owner (right password) that the account is suspended', async () => {
      prisma.user.findUnique.mockResolvedValue(user({ suspended: true }));
      await expect(
        svc.signIn({ email: 'a@x.co', password: pw } as any),
      ).rejects.toThrow('suspended');
    });

    it('locks the account after 10 failures (any IP), even for the right password, then a success resets', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      for (let i = 0; i < 10; i++) {
        await expect(
          svc.signIn({ email: 'a@x.co', password: 'wrong' } as any),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
      const err: HttpException = await svc
        .signIn({ email: 'a@x.co', password: pw } as any)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(10); // not even looked up while locked

      loginAttemptLimiter.reset('user:a@x.co');
      for (let i = 0; i < 9; i++)
        await svc
          .signIn({ email: 'a@x.co', password: 'wrong' } as any)
          .catch(() => undefined);
      await svc.signIn({ email: 'a@x.co', password: pw } as any); // success resets the counter
      for (let i = 0; i < 9; i++)
        await svc
          .signIn({ email: 'a@x.co', password: 'wrong' } as any)
          .catch(() => undefined);
      await expect(
        svc.signIn({ email: 'a@x.co', password: pw } as any),
      ).resolves.toBeDefined();
    });

    it('treats email case variants as the same account for lockout', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      for (const e of [
        'A@x.co',
        'a@X.co',
        'A@X.CO',
        'a@x.co',
        'A@x.co',
        'a@X.co',
        'A@X.CO',
        'a@x.co',
        'A@x.co',
        'a@X.co',
      ]) {
        await svc
          .signIn({ email: e, password: 'wrong' } as any)
          .catch(() => undefined);
      }
      const err = await svc
        .signIn({ email: 'a@x.co', password: pw } as any)
        .catch((e) => e);
      expect(err.getStatus?.()).toBe(429);
    });
  });

  describe('admin login', () => {
    const admin = (over: Record<string, unknown> = {}) => ({
      id: 'ad1',
      email: 'admin@x.co',
      password: hash,
      isActive: true,
      ...over,
    });

    it('logs in an active admin with the right password', async () => {
      prisma.admin.findUnique.mockResolvedValue(admin());
      const res = await svc.adminLogin({
        email: 'admin@x.co',
        password: pw,
      } as any);
      expect(res.user.role).toBe('ADMIN');
    });

    it('unknown admin: same error and same bcrypt work as a wrong password', async () => {
      prisma.admin.findUnique.mockResolvedValue(null);
      await expect(
        svc.adminLogin({ email: 'ghost@x.co', password: 'x' } as any),
      ).rejects.toThrow('Invalid email or password');
      expect(compare).toHaveBeenCalledTimes(1);
    });

    it('a deactivated admin is not revealed without the password (401), only with it (403)', async () => {
      prisma.admin.findUnique.mockResolvedValue(admin({ isActive: false }));
      await expect(
        svc.adminLogin({ email: 'admin@x.co', password: 'wrong' } as any),
      ).rejects.toThrow('Invalid email or password');
      const err = await svc
        .adminLogin({ email: 'admin@x.co', password: pw } as any)
        .catch((e) => e);
      expect(err.getStatus()).toBe(403);
    });

    it('locks after 10 failures', async () => {
      prisma.admin.findUnique.mockResolvedValue(admin());
      for (let i = 0; i < 10; i++)
        await svc
          .adminLogin({ email: 'admin@x.co', password: 'wrong' } as any)
          .catch(() => undefined);
      const err = await svc
        .adminLogin({ email: 'admin@x.co', password: pw } as any)
        .catch((e) => e);
      expect(err.getStatus()).toBe(429);
    });
  });
});
