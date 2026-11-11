import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  PrismaClientKnownRequestError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
} from '@prisma/client/runtime/library';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * Check if error is a database/infrastructure error that should be hidden from users
   */
  private isInfrastructureError(exception: unknown): boolean {
    // Prisma database errors
    if (
      exception instanceof PrismaClientKnownRequestError ||
      exception instanceof PrismaClientInitializationError ||
      exception instanceof PrismaClientRustPanicError
    ) {
      return true;
    }

    // Check for database connection errors in error message
    if (exception instanceof Error) {
      const errorMessage = exception.message.toLowerCase();
      const infrastructureKeywords = [
        'database',
        "can't reach database server",
        'connection',
        'timeout',
        'econnrefused',
        'econnreset',
        'etimedout',
        'prisma',
        'query engine',
        'migration',
      ];

      return infrastructureKeywords.some((keyword) =>
        errorMessage.includes(keyword),
      );
    }

    return false;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status and message
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let userMessage: string | string[] = 'Internal server error'; // Message to show to user
    let detailedMessage: string | string[] = ''; // Detailed message for logging
    let retryAfter: number | undefined;
    let rateLimitMeta: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (Array.isArray(exceptionResponse)) {
        detailedMessage = exceptionResponse
          .map((m) => (typeof m === 'string' ? m : String(m)))
          .join(', ');
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, unknown>;
        const rawMessage = body.message ?? exception.message;
        const resolved =
          typeof rawMessage === 'string' || Array.isArray(rawMessage)
            ? (rawMessage as string | string[])
            : exception.getStatus() >= 500
              ? 'Internal server error'
              : 'Bad request';
        // Sanitize array validation messages (e.g. from class-validator)
        // to avoid leaking internal DTO field names.
        detailedMessage = Array.isArray(resolved)
          ? resolved.map((m) => (typeof m === 'string' ? m : String(m)))
          : resolved;
        // Preserve structured 429 payload from CustomThrottlerGuard
        // (or raw ThrottlerException) instead of flattening it to a string.
        if (status === HttpStatus.TOO_MANY_REQUESTS) {
          if (typeof body.retryAfter === 'number') {
            retryAfter = body.retryAfter;
          }
          if (
            typeof body.limit !== 'undefined' ||
            typeof body.resetAfter !== 'undefined'
          ) {
            rateLimitMeta = {
              ...(typeof body.limit !== 'undefined'
                ? { limit: body.limit }
                : {}),
              ...(typeof body.resetAfter !== 'undefined'
                ? { resetAfter: body.resetAfter }
                : {}),
            };
          }
        }
      } else {
        detailedMessage =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : exception.message;
      }

      // For HttpException, check if it's a database error
      if (this.isInfrastructureError(exception)) {
        userMessage =
          'An error occurred while processing your request. Please try again later.';
      } else {
        userMessage = detailedMessage;
      }

      // Friendly fallback for raw ThrottlerException ("ThrottlerException: Too Many Requests")
      if (
        status === HttpStatus.TOO_MANY_REQUESTS &&
        typeof userMessage === 'string' &&
        /throttler/i.test(userMessage)
      ) {
        userMessage =
          'Rate limit exceeded. Too many requests, please try again later.';
      }
    } else if (exception instanceof Error) {
      detailedMessage = exception.message;

      // Check if it's an infrastructure error
      if (this.isInfrastructureError(exception)) {
        userMessage =
          'An error occurred while processing your request. Please try again later.';
      } else {
        // For non-infrastructure errors in production, still use generic message
        // In development, show the actual error
        if (process.env.NODE_ENV === 'development') {
          userMessage = detailedMessage;
        } else {
          userMessage =
            'An error occurred while processing your request. Please try again later.';
        }
      }
    }

    // Standardized error response
    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      method: request.method,
      message: userMessage, // Always return generic message to user
    };

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      errorResponse.error = 'Too Many Requests';
      // Surface retry hint in body (headers already set by CustomThrottlerGuard).
      const headerRetryAfter = response.getHeader?.('Retry-After');
      const parsedHeader =
        typeof headerRetryAfter === 'string'
          ? Number.parseInt(headerRetryAfter, 10)
          : typeof headerRetryAfter === 'number'
            ? headerRetryAfter
            : undefined;
      if (retryAfter === undefined && Number.isFinite(parsedHeader)) {
        retryAfter = parsedHeader as number;
      }
      if (retryAfter !== undefined) {
        errorResponse.retryAfter = retryAfter;
        // Ensure Retry-After header exists even if guard was bypassed.
        if (!response.getHeader?.('Retry-After')) {
          response.setHeader('Retry-After', String(retryAfter));
        }
      }
      if (rateLimitMeta) {
        Object.assign(errorResponse, rateLimitMeta);
      }
    }

    // Suppress noisy scanner/bot 404 probes — log at debug level instead of error
    const isScannerProbe =
      status === HttpStatus.NOT_FOUND &&
      /\.(php[0-9]?|phtml|asp|aspx|cgi|pl|py|rb|env|jsp|cgi-bin)$/i.test(
        request.url,
      );

    if (isScannerProbe) {
      this.logger.debug(
        `Scanner probe blocked: ${request.method} ${request.url}`,
      );
    } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
      this.logger.warn(
        `Rate limit exceeded: ${request.method} ${request.url} - retryAfter: ${retryAfter ?? 'unknown'}s`,
      );
    } else {
      this.logger.error(
        `${request.method} ${request.url} - Status: ${status}`,
        `Detailed error: ${detailedMessage || (exception instanceof Error ? exception.message : 'Unknown error')}`,
        exception instanceof Error ? exception.stack : '',
      );
    }

    // Send response with generic message
    response.status(status).json(errorResponse);
  }
}
