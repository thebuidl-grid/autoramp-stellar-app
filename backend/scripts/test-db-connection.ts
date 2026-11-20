import { PrismaClient } from '@prisma/client';

const TABLE_NAME = process.env.TABLE_NAME || 'supported_tokens';
const ROW_LIMIT = Math.min(Math.max(parseInt(process.env.ROW_LIMIT || '5', 10) || 5, 1), 100);

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: DATABASE_URL env var is required');
    process.exit(1);
  }

  const masked = url.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@');
  console.log(`Connecting to: ${masked}`);

  const prisma = new PrismaClient();
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1 as ok`;
    const ms = Date.now() - started;

    const count = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM information_schema.tables
      WHERE table_schema = 'public'
    `;

    console.log(`PASS: SELECT 1 returned in ${ms}ms`);
    console.log(`PASS: public tables found: ${count[0].n}`);

    if (!/^[a-z_][a-z0-9_]*$/.test(TABLE_NAME)) {
      throw new Error(`invalid TABLE_NAME: ${TABLE_NAME}`);
    }

    const exists = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${TABLE_NAME}
      ) AS exists
    `;
    if (!exists[0].exists) {
      throw new Error(`table "${TABLE_NAME}" not found in public schema`);
    }

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${TABLE_NAME}" LIMIT ${ROW_LIMIT}`,
    );
    const total = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM "${TABLE_NAME}"`,
    );

    console.log(`PASS: read ${rows.length} row(s) from "${TABLE_NAME}" (total: ${total[0].n})`);
    const redacted = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) =>
          /password|secret|token|api_key|private/i.test(k) && v != null
            ? [k, '***']
            : [k, v],
        ),
      ),
    );
    console.log(JSON.stringify(redacted, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  } catch (err) {
    console.error('FAIL: could not connect/query database');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
