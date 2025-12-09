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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, body } = request;

    // Skip logging for health/internal paths
    if (url.includes('/health') || url.startsWith('/api/internal')) {
      return next.handle();
    }

    // Log request
    // this.logger.log(
    //   `${method} ${url} - Body size: ${JSON.stringify(body).length} bytes`,
    // );

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        const status = response.statusCode;

        this.logger.log(
          `${method} ${url} - ${status} - ${duration}ms`,
          LoggingInterceptor.name,
        );
      }),
    );
  }
}
