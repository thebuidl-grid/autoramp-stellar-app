import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma Service
 * 
 * This service provides database access through Prisma Client.
 * It handles connection lifecycle and ensures proper cleanup.
 * 
 * Usage:
 * - Inject this service into your modules to access the database
 * - Use prisma.user, prisma.onrampTransaction, etc. to access models
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Initialize Prisma Client connection when module starts
   * This ensures the database connection is established before the app starts handling requests
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Disconnect Prisma Client when module is destroyed
   * This ensures proper cleanup of database connections
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

