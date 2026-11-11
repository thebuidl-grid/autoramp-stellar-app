import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogQueueService } from './audit-log-queue.service';
import { AuditInterceptor } from '../interceptors/audit.interceptor';
import { BalanceCacheService } from './balance-cache.service';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    AuditLogQueueService,
    AuditService,
    AuditInterceptor,
    BalanceCacheService,
  ],
  exports: [
    AuditService,
    AuditLogQueueService,
    AuditInterceptor,
    BalanceCacheService,
  ],
})
export class AuditModule {}
