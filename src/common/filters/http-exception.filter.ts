import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status and message
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Standardized error response (path removed as per requirements)
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      method: request.method,
      message,
    };

    // Log error (full details in dev, minimal in prod)
    if (process.env.NODE_ENV === 'development') {
      this.logger.error(
        `${request.method} ${request.url} - Error: ${JSON.stringify(errorResponse)}`,
        exception instanceof Error ? exception.stack : '',
      );
    } else {
      this.logger.error(
        `${request.method} ${request.url} - Status: ${status}, Message: ${message}`,
      );
    }

    // Send response
    response.status(status).json(errorResponse);
  }
}
