import * as fs from 'fs';
import * as path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '@prisma/client';

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'prisma', 'migrations');
const DATA_ROOT = path.join(__dirname, '..', '.pglite-data');

/**
 * Real, file-based, Postgres-compatible database for e2e tests — no
 * external DB server needed. Applies the project's actual migration SQL
 * files (in order) against a fresh PGlite data directory, then hands back
 * a genuine PrismaClient wired to it via the PGlite driver adapter, so
 * enums/UUIDs/JSONB/Decimal/unique constraints all behave exactly as they
 * would against real Postgres.
 *
 * Each test suite gets its own isolated data directory (named after it)
 * so parallel/repeated runs never collide or need a shared running process.
 */
export async function createTestDatabase(suiteName: string): Promise<{
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}> {
  const dataDir = path.join(DATA_ROOT, `${suiteName}-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const client = new PGlite({ dataDir });
  await applyMigrations(client);

  const adapter = new PrismaPGlite(client);
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      await client.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function applyMigrations(client: PGlite): Promise<void> {
  const migrationDirs = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const dir of migrationDirs) {
    const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    await client.exec(sql);
  }
}
