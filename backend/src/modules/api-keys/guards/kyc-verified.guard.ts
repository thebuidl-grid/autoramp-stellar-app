import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * KYC Verified Guard
 * 
 * Ensures that only users with verified KYC status can access protected routes.
 * Must be used after JwtAuthGuard or ApiKeyGuard to ensure user is authenticated.
 */
@Injectable()
export class KycVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException(
        'KYC verification is required to access this endpoint. Please complete your KYC verification first.',
      );
    }

    return true;
  }
}

