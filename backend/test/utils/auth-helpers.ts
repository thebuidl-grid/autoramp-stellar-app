import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';

export async function createTestUser(
  prisma: PrismaClient,
  overrides: Partial<{ email: string; walletAddress: string; role: 'USER' | 'ADMIN' }> = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: '',
      walletAddress: overrides.walletAddress,
      role: overrides.role || 'USER',
    },
  });
}

// JwtStrategy's ADMIN branch looks the subject up in the separate `admin`
// table (not `user`), so an ADMIN-role JWT only validates against a real
// Admin row.
export async function createTestAdmin(prisma: PrismaClient, overrides: Partial<{ email: string }> = {}) {
  return prisma.admin.create({
    data: {
      email: overrides.email || `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: '',
    },
  });
}

// AuthModule's JwtModule (with JWT_SECRET configured) isn't exported/global —
// other modules (e.g. SwapModule, for its WebSocket gateway) register their
// own separate JwtModule instances, so resolving JwtService from the root
// TestingModule is ambiguous. Sign directly with the same secret instead.
const testJwtService = new JwtService({ secret: process.env.JWT_SECRET });

export function signJwtFor(user: { id: string; email: string; role: string }): string {
  return testJwtService.sign({ userId: user.id, email: user.email, role: user.role });
}
