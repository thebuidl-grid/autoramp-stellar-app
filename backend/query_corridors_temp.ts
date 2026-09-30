import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const corridors = await prisma.corridor.findMany({ where: { isActive: true } });
  console.log('CORRIDORS:', corridors.map((c: any) => `${c.stablecoinCode} (${c.fiatCurrency}, ${c.countryCode})`).join(', '));
  const chains = await prisma.chain.findMany({ where: { isActive: true } });
  console.log('CHAINS:', chains.map((c: any) => `${c.name} (${c.chainType})`).join(', '));
  const tokens = await prisma.chainToken.findMany();
  console.log('CHAIN TOKENS:', tokens.length === 0 ? 'none registered' : tokens.map((t: any) => t.tokenCode).join(', '));
}
main().finally(() => prisma.$disconnect());
