import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { program } from 'commander';

const prisma = new PrismaClient();

async function main() {
  program
    .version('1.0.0')
    .description('Admin user management script')
    .option('-e, --email <email>', 'Admin email')
    .option('-p, --password <password>', 'Admin password')
    .parse(process.argv);

  const options = program.opts();
  const { email, password } = options;

  if (!email || !password) {
    console.error('Email and password are required');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const admin = await prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
      },
    });
    console.log(`Admin user created successfully: ${admin.email}`);
  } catch (error) {
    if (error.code === 'P2002') {
      console.error('Admin with this email already exists');
    } else {
      console.error('Error creating admin user:', error);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
