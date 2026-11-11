import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * OTC Guard
 *
 * Ensures that only users with OTC enabled can access protected OTC routes.
 * Must be used after JwtAuthGuard to ensure user is authenticated.
 */
@Injectable()
export class OtcGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    if (!user.isOTCEnabled) {
      throw new ForbiddenException('OTC access not enabled for this user');
    }

    return true;
  }
}
