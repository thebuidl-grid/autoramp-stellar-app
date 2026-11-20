import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy activity tracking', () => {
  const build = () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.co',
          role: 'USER',
          suspended: false,
          isOTCEnabled: false,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      admin: { findUnique: jest.fn() },
    };
    const config = { get: jest.fn().mockReturnValue('secret') };
    return { prisma, strategy: new JwtStrategy(config as any, prisma as any) };
  };
  const payload = { userId: 'u1', email: 'a@b.co', role: 'USER' };

  it('records lastActiveAt, but at most once per interval per user', async () => {
    const { prisma, strategy } = build();
    await strategy.validate(payload);
    await strategy.validate(payload);
    await strategy.validate(payload);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { lastActiveAt: expect.any(Date) },
    });
  });

  it('never fails the request when the write fails, and retries next time', async () => {
    const { prisma, strategy } = build();
    prisma.user.update.mockRejectedValueOnce(new Error('db down'));
    await expect(strategy.validate(payload)).resolves.toMatchObject({
      id: 'u1',
    });
    await new Promise((r) => setImmediate(r));
    await strategy.validate(payload);
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('does not track admins', async () => {
    const { prisma, strategy } = build();
    prisma.admin.findUnique.mockResolvedValue({
      id: 'a1',
      email: 'x',
      isActive: true,
    });
    await strategy.validate({ userId: 'a1', email: 'x', role: 'ADMIN' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
