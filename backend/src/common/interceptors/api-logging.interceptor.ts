import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma.service';
import { Request, Response } from 'express';

/**
 * API Logging Interceptor
 *
 * Logs all API requests made with API keys for tracking and analytics.
 */
@Injectable()
export class ApiLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiLoggingInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Only log if API key is present
    const merchantApiKey = (request as any).merchantApiKey;
    if (!merchantApiKey) {
      return next.handle();
    }

    const method = request.method;
    const path = request.url.split('?')[0];
    const ipAddress = request.ip || request.socket.remoteAddress;
    const userAgent = request.get('user-agent');
    const requestBody = this.sanitizeBody(request.body);

    return next.handle().pipe(
      tap({
        next: async (data) => {
          await this.logRequest({
            apiKey: merchantApiKey,
            userId: (request.user as any)?.id,
            method,
            path,
            statusCode: response.statusCode,
            ipAddress,
            userAgent,
            requestBody,
            responseBody: this.sanitizeBody(data),
            errorMessage: null,
          });
        },
        error: async (error) => {
          await this.logRequest({
            apiKey: merchantApiKey,
            userId: (request.user as any)?.id,
            method,
            path,
            statusCode: error.status || 500,
            ipAddress,
            userAgent,
            requestBody,
            responseBody: null,
            errorMessage: error.message || 'Unknown error',
          });
        },
      }),
    );
  }

  private async logRequest(data: {
    apiKey: string;
    userId?: string;
    method: string;
    path: string;
    statusCode: number;
    ipAddress?: string;
    userAgent?: string;
    requestBody: any;
    responseBody: any;
    errorMessage: string | null;
  }) {
    try {
      const hashed = require('crypto')
        .createHash('sha256')
        .update(data.apiKey)
        .digest('hex');

      const merchantApiKeyRecord = await this.prisma.merchantApiKey.findFirst({
        where: { key: hashed },
        select: { id: true, merchantId: true },
      });

      if (merchantApiKeyRecord) {
        await this.prisma.merchantApiKey.update({
          where: { id: merchantApiKeyRecord.id },
          data: { lastUsedAt: new Date() },
        });
      }

      await this.prisma.merchantApiRequestLog.create({
        data: {
          merchantApiKeyId: merchantApiKeyRecord?.id || null,
          merchantId: merchantApiKeyRecord?.merchantId || null,
          method: data.method,
          path: data.path,
          statusCode: data.statusCode,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          requestBody: data.requestBody,
          responseBody: data.responseBody,
          errorMessage: data.errorMessage,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log API request:', error);
    }
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'key',
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

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}
