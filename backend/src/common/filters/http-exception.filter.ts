import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaClientKnownRequestError, PrismaClientInitializationError, PrismaClientRustPanicError } from '@prisma/client/runtime/library';

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
        'can\'t reach database server',
        'connection',
        'timeout',
        'econnrefused',
        'econnreset',
        'etimedout',
        'prisma',
        'query engine',
        'migration',
      ];

      return infrastructureKeywords.some(keyword => errorMessage.includes(keyword));
    }

    return false;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status and message
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let userMessage = 'Internal server error'; // Message to show to user
    let detailedMessage = ''; // Detailed message for logging

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      detailedMessage =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
      
      // For HttpException, check if it's a database error
      if (this.isInfrastructureError(exception)) {
        userMessage = 'An error occurred while processing your request. Please try again later.';
      } else {
        userMessage = detailedMessage;
      }
    } else if (exception instanceof Error) {
      detailedMessage = exception.message;
      
      // Check if it's an infrastructure error
      if (this.isInfrastructureError(exception)) {
        userMessage = 'An error occurred while processing your request. Please try again later.';
      } else {
        // For non-infrastructure errors in production, still use generic message
        // In development, show the actual error
        if (process.env.NODE_ENV === 'development') {
          userMessage = detailedMessage;
        } else {
          userMessage = 'An error occurred while processing your request. Please try again later.';
        }
      }
    }

    // Standardized error response
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      method: request.method,
      message: userMessage, // Always return generic message to user
    };

    // Always log full error details on server side (for debugging)
      this.logger.error(
      `${request.method} ${request.url} - Status: ${status}`,
      `Detailed error: ${detailedMessage || (exception instanceof Error ? exception.message : 'Unknown error')}`,
        exception instanceof Error ? exception.stack : '',
      );

    // Send response with generic message
    response.status(status).json(errorResponse);
  }
}
