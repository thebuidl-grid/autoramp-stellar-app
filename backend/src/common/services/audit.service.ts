import { Injectable, Logger } from '@nestjs/common';
import { AuditLogQueueService } from './audit-log-queue.service';

export interface AuditLogData {
  merchantId: string;
  action: string;
  provider?: string;
  endpoint: string;
  method: string;

  request?: any;

  response?: any;
  statusCode?: number;
  duration?: number;
  success?: boolean;
  errorMessage?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly queue: AuditLogQueueService) {}

  log(data: AuditLogData): void {
    this.queue.enqueue({
      merchantId: data.merchantId,
      action: data.action,
      provider: data.provider,
      endpoint: data.endpoint,
      method: data.method,
      request: data.request,
      response: data.response,
      statusCode: data.statusCode,
      duration: data.duration,
      success: data.success,
      errorMessage: data.errorMessage,
    });
  }
}
