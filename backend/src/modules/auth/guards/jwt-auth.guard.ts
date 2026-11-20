import {
  HttpException,
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

/**
 * JWT Auth Guard
 *
 * Protects routes by requiring a valid JWT token.
 * Can be used with @UseGuards(JwtAuthGuard) decorator or applied globally.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Override canActivate to allow public routes
   * Routes marked with @Public() decorator will bypass authentication
   */
  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Override handleRequest to provide better error messages.
   *
   * A missing/expired/invalid token is normal client behaviour (logged-out
   * browsers, stale sessions), so it is logged at debug level on one line.
   * Only genuinely unexpected errors are logged as errors, with a stack.
   */
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      const expected =
        !err || (err instanceof HttpException && err.getStatus() < 500);
      if (expected) {
        this.logger.debug(
          `Request rejected: ${err?.message ?? info?.message ?? info ?? 'no user'}`,
        );
      } else {
        this.logger.error(
          `JWT auth failed unexpectedly: ${err?.message ?? err}`,
          err?.stack,
        );
      }

      throw err || new UnauthorizedException('Invalid or missing token');
    }
    return user;
  }
}
