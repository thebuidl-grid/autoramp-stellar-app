import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

async function createAdmin() {
    console.log('--- Create Admin & User Profile ---');

    const email = await question('Enter email: ');
    if (!email || !email.includes('@')) {
        console.error('Invalid email.');
        process.exit(1);
    }

    // Check both tables
    const [existingAdmin, existingUser] = await Promise.all([
        prisma.admin.findUnique({ where: { email } }),
        prisma.user.findUnique({ where: { email } })
    ]);

    if (existingAdmin || existingUser) {
        console.error('Admin or User with this email already exists.');
        process.exit(1);
    }

    const password = await question('Enter password: ');
    if (!password || password.length < 8) {
        console.error('Password must be at least 8 characters long.');
        process.exit(1);
    }

    const firstName = await question('Enter first name (optional): ');
    const lastName = await question('Enter last name (optional): ');

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    try {
        console.log('Creating profiles...');

        // Execute in a transaction for atomicity
        const [admin, user] = await prisma.$transaction([
            prisma.admin.create({
                data: {
                    id: userId,
                    email,
                    password: hashedPassword,
                    firstName: firstName || null,
                    lastName: lastName || null,
                    isActive: true,
                }
            }),
            prisma.user.create({
                data: {
                    id: userId,
                    email,
                    password: hashedPassword,
                    role: 'ADMIN',
                }
            })
        ]);

        console.log(`\nSuccess! Admin and User profiles created with ID: ${userId}`);
        console.log(`Email: ${admin.email}`);
        console.log(`Name: ${admin.firstName} ${admin.lastName}`);
        console.log(`Role: ${user.role}`);
    } catch (error) {
        console.error('Error creating profiles:', error);
    } finally {
        await prisma.$disconnect();
        rl.close();
    }
}

createAdmin();
