import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Database Module
 * 
 * This module provides global access to Prisma Service for database operations.
 * It's marked as Global so it can be imported once in AppModule and used throughout the application.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}

