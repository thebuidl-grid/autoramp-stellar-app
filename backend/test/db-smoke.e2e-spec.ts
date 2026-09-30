import { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './utils/pglite-db';

describe('PGlite test database (smoke)', () => {
  let prisma: PrismaClient;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const db = await createTestDatabase('db-smoke');
    prisma = db.prisma;
    cleanup = db.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('applies migrations and supports real Postgres features (UUID default, enum, JSONB, unique constraint)', async () => {
    const user = await prisma.user.create({
      data: { email: 'smoke@example.com', password: '' },
    });

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/); // gen_random_uuid()
    expect(user.role).toBe('USER'); // enum default

    const onramp = await prisma.onrampTransaction.create({
      data: {
        userId: user.id,
        reference: 'txn_ref_smoke1',
        amount: '10000.00',
        destinationAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
        depositAccount: { bankName: 'Test Bank', accountNumber: '123' }, // JSONB
      },
    });
    expect(onramp.status).toBe('PENDING');
    expect((onramp.depositAccount as any).bankName).toBe('Test Bank');

    await expect(
      prisma.user.create({ data: { email: 'smoke@example.com', password: '' } }),
    ).rejects.toThrow(); // unique constraint on email

    const found = await prisma.onrampTransaction.findUnique({
      where: { reference: 'txn_ref_smoke1' },
      include: { user: true },
    });
    expect(found?.user.email).toBe('smoke@example.com');
  });
});
