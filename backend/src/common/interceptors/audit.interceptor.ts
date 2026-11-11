import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuditService } from '../services/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const { method, url } = request;
    const path = url.split('?')[0];

    if (
      path.includes('/health') ||
      path.startsWith('/api/internal') ||
      method === 'OPTIONS'
    ) {
      return next.handle();
    }

    const merchantId =
      (request.user as any)?.merchantId ||
      (request.user as any)?.id ||
      (request as any).merchantApiKey?.merchantId;

    if (!merchantId) {
      return next.handle();
    }

    const startTime = Date.now();
    const requestBody = this.sanitize(request.body);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          this.auditService.log({
            merchantId,
            action: `${method} ${path}`,
            endpoint: path,
            method,
            request: requestBody,
            response: this.sanitize(data),
            statusCode: response.statusCode,
            duration,
            success: response.statusCode < 400,
          });
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const status = err.status || err.statusCode || 500;
          this.auditService.log({
            merchantId,
            action: `${method} ${path}`,
            endpoint: path,
            method,
            request: requestBody,
            statusCode: status,
            duration,
            success: false,
            errorMessage: err.message || 'Unknown error',
          });
        },
      }),
    );
  }

  private sanitize(body: any): any {
    if (!body || typeof body !== 'object') return body;
    const redacted = { ...body };
    const sensitive = [
      'password',
      'token',
      'apiKey',
      'secret',
      'key',
      'pin',
      'bvn',
      'nin',
      'identityNumber',
      'number',
      'accountNumber',
      'debitAccountNumber',
      'bankAccountNumber',
      'phoneNumber',
      'emailAddress',
    ];
    for (const field of sensitive) {
      if (redacted[field]) redacted[field] = '***REDACTED***';
    }
    return redacted;
  }
}
