import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

/**
 * JWT Strategy
 *
 * Validates JWT tokens and extracts user information from the token payload.
 * Used to protect routes that require authentication.
 */
/** Write lastActiveAt at most this often per user (per process). */
const ACTIVITY_WRITE_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly lastActivityWrite = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Validate JWT payload and return user information
   * This method is called after the JWT is verified
   *
   * @param payload - Decoded JWT payload containing userId and email
   * @returns User or Admin object to be attached to request
   */
  async validate(payload: { userId: string; email: string; role: string }) {
    // Check if it's an admin
    if (payload.role === 'ADMIN') {
      const admin = await this.prisma.admin.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      });

      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Admin not found or inactive');
      }

      return { ...admin, role: 'ADMIN' };
    }

    // Fetch user from database to ensure they still exist
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        suspended: true,
        isOTCEnabled: true,
      },
    });

    if (user) {
      if (user.suspended) {
        throw new UnauthorizedException('Your account has been suspended');
      }

      this.touchActivity(user.id);

      return {
        id: user.id,
        email: user.email,
        role: user.role || 'USER',
        isOTCEnabled: user.isOTCEnabled,
      };
    }

    throw new UnauthorizedException('User not found');
  }

  /**
   * Record that a user is active (powers DAU/WAU/MAU in admin analytics).
   * Throttled per user and fire-and-forget: it must never slow down or fail a request.
   */
  private touchActivity(userId: string): void {
    const now = Date.now();
    const last = this.lastActivityWrite.get(userId) ?? 0;
    if (now - last < ACTIVITY_WRITE_INTERVAL_MS) return;
    this.lastActivityWrite.set(userId, now);
    this.prisma.user
      .update({ where: { id: userId }, data: { lastActiveAt: new Date(now) } })
      .catch(() => this.lastActivityWrite.delete(userId));
  }
}
