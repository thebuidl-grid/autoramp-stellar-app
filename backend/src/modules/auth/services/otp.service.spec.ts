import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { PrismaService } from '../../../database/prisma.service';

const sendMock = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

describe('OtpService', () => {
  let prisma: {
    otp: { findFirst: jest.Mock; updateMany: jest.Mock; create: jest.Mock; deleteMany: jest.Mock; update: jest.Mock };
  };

  function makeService(config: Record<string, string | undefined>): OtpService {
    const configService = { get: jest.fn((key: string) => config[key]) } as unknown as ConfigService;
    return new OtpService(prisma as unknown as PrismaService, configService);
  }

  beforeEach(() => {
    sendMock.mockReset();
    prisma = {
      otp: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
    };
  });

  describe('sendOtp when email delivery fails', () => {
    beforeEach(() => {
      sendMock.mockResolvedValue({ data: null, error: { message: 'invalid api key' } });
    });

    it('does NOT return the code when NODE_ENV is unset/development and the dev flag is not set', async () => {
      // NODE_ENV defaults to 'development' — a deploy that forgets to set it
      // must not start handing out login codes in API responses.
      const service = makeService({ RESEND_API_KEY: 're_test', NODE_ENV: 'development' });

      await expect(service.sendOtp('victim@example.com')).rejects.toThrow(BadRequestException);
      expect(prisma.otp.deleteMany).toHaveBeenCalled();
    });

    it('returns the code only when OTP_DEV_RETURN_CODE=true outside production', async () => {
      const service = makeService({ RESEND_API_KEY: 're_test', NODE_ENV: 'development', OTP_DEV_RETURN_CODE: 'true' });

      const result = await service.sendOtp('dev@example.com');

      expect(result.devOtpCode).toMatch(/^\d{6}$/);
      expect(prisma.otp.deleteMany).not.toHaveBeenCalled();
    });

    it('ignores OTP_DEV_RETURN_CODE in production', async () => {
      const service = makeService({ RESEND_API_KEY: 're_test', NODE_ENV: 'production', OTP_DEV_RETURN_CODE: 'true' });

      await expect(service.sendOtp('victim@example.com')).rejects.toThrow(BadRequestException);
    });
  });

  it('never includes the code in the response when email delivery succeeds', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const service = makeService({ RESEND_API_KEY: 're_test', OTP_DEV_RETURN_CODE: 'true' });

    const result = await service.sendOtp('user@example.com');

    expect(result.devOtpCode).toBeUndefined();
    expect(prisma.otp.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'user@example.com', code: expect.stringMatching(/^\d{6}$/) }),
    });
  });
});
