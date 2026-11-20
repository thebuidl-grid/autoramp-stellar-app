import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
console.log('OtcTransaction fields:', Object.keys((prisma as any).otcTransaction || {}));
prisma.$disconnect();
