import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { OtpService, otpAttemptLimiter } from './otp.service';

describe('OtpService security', () => {
  let svc: OtpService;
  let prisma: any;
  const email = 'Victim@Example.com';

  beforeEach(() => {
    prisma = {
      otp: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn(),
      },
    };
    const config = {
      get: jest.fn((k: string) =>
        k === 'RESEND_API_KEY' ? 're_test' : undefined,
      ),
    };
    svc = new OtpService(prisma, config as any);
    (svc as any).resend = { emails: { send: jest.fn().mockResolvedValue({}) } };
    otpAttemptLimiter.reset(`otp:SIGNUP:${email.toLowerCase()}`);
  });

  const storeCode = async (code: string) => {
    prisma.otp.findMany.mockResolvedValue([
      { id: 'o1', code: await bcrypt.hash(code, 4) },
    ]);
  };

  describe('code generation', () => {
    it('produces 6-digit codes without touching Math.random', () => {
      const random = jest.spyOn(Math, 'random');
      const codes = Array.from({ length: 2000 }, () =>
        (svc as any).generateOtpCode(),
      );
      expect(random).not.toHaveBeenCalled();
      for (const c of codes) {
        expect(c).toMatch(/^[1-9]\d{5}$/);
      }
      expect(new Set(codes).size).toBeGreaterThan(1900); // not a constant / tiny range
      random.mockRestore();
    });
  });

  describe('guessing protection', () => {
    it('accepts the right code and marks it used', async () => {
      await storeCode('123456');
      await expect(svc.verifyOtp(email, '123456')).resolves.toBe(true);
      expect(prisma.otp.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { isUsed: true },
      });
    });

    it('locks after 5 wrong guesses, burns the outstanding codes, and refuses even the right code', async () => {
      await storeCode('123456');
      for (let i = 0; i < 4; i++) {
        await expect(svc.verifyOtp(email, '000000')).rejects.toThrow(
          'Invalid or expired OTP code',
        );
      }
      expect(prisma.otp.updateMany).not.toHaveBeenCalled();

      await expect(svc.verifyOtp(email, '000000')).rejects.toThrow(
        'Too many incorrect attempts',
      );
      expect(prisma.otp.updateMany).toHaveBeenCalledWith({
        where: { email, purpose: 'SIGNUP', isUsed: false },
        data: { isUsed: true },
      });

      // the correct code no longer works until a new code is requested
      await expect(svc.verifyOtp(email, '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.otp.update).not.toHaveBeenCalled();
    });

    it('counts guesses per email regardless of letter case (no bypass by changing case)', async () => {
      await storeCode('123456');
      for (const variant of [
        'VICTIM@example.com',
        'victim@EXAMPLE.com',
        'Victim@Example.com',
        'victim@example.com',
      ]) {
        await expect(svc.verifyOtp(variant, '000000')).rejects.toThrow(
          'Invalid or expired',
        );
      }
      await expect(
        svc.verifyOtp('vIcTiM@example.com', '000000'),
      ).rejects.toThrow('Too many incorrect attempts');
    });

    it('a successful verification resets the counter', async () => {
      await storeCode('123456');
      for (let i = 0; i < 3; i++)
        await expect(svc.verifyOtp(email, '000000')).rejects.toThrow();
      await svc.verifyOtp(email, '123456');
      for (let i = 0; i < 4; i++)
        await expect(svc.verifyOtp(email, '000000')).rejects.toThrow(
          'Invalid or expired',
        );
    });

    it('requesting a new code unlocks (so an attacker cannot lock the owner out for long)', async () => {
      await storeCode('123456');
      for (let i = 0; i < 5; i++)
        await expect(svc.verifyOtp(email, '000000')).rejects.toThrow();
      await expect(svc.verifyOtp(email, '123456')).rejects.toThrow('Too many');

      await svc.sendOtp(email);

      await storeCode('654321');
      await expect(svc.verifyOtp(email, '654321')).resolves.toBe(true);
    });

    it('limits are per purpose and per email', async () => {
      await storeCode('123456');
      for (let i = 0; i < 5; i++)
        await expect(
          svc.verifyOtp(email, '000000', 'SIGNUP'),
        ).rejects.toThrow();
      await expect(
        svc.verifyOtp(email, '123456', 'BANK_ACCOUNT_VERIFICATION'),
      ).resolves.toBe(true);
      await expect(
        svc.verifyOtp('other@example.com', '123456', 'SIGNUP'),
      ).resolves.toBe(true);
    });
  });
});
