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
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
      },
    });

    if (user) {
      return {
        id: user.id,
        email: user.email,
        role: user.role || 'USER',
      };
    }

    throw new UnauthorizedException('User not found');
  }
}

