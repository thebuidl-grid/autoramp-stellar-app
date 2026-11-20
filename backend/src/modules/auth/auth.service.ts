import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { SignUpDto, SignInDto, AdminLoginDto } from './dto';
import { OtpService } from './services/otp.service';
import { randomBytes } from 'crypto';
import { AttemptLimiter } from '../../common/security/attempt-limiter';

/**
 * Failed password logins per account, independent of IP (IP throttling alone does not stop
 * distributed guessing). 10 failures lock the account's login for 15 minutes.
 */
export const loginAttemptLimiter = new AttemptLimiter(
  10,
  15 * 60 * 1000,
  15 * 60 * 1000,
);

/**
 * A real bcrypt hash of a random value. Logins for unknown accounts still run a bcrypt
 * comparison against it, so a missing account takes as long as a wrong password and response
 * time cannot be used to find out which emails are registered.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hash(randomBytes(16).toString('hex'), 10);

const TOO_MANY_LOGINS =
  'Too many failed login attempts. Please try again later.';

/**
 * Auth Service
 *
 * Handles user and admin authentication including:
 * - User sign up and sign in
 * - Admin login
 * - JWT token generation
 * - Password hashing and verification
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Sign up or Login (Email-only authentication)
   *
   * Simplified authentication flow:
   * - Verifies OTP code
   * - If user exists: logs them in
   * - If user doesn't exist: creates new account automatically
   *
   * @param signUpDto - User email and OTP code
   * @returns User object and access token
   */
  async signUp(signUpDto: SignUpDto) {
    const { email, walletAddress, otpCode } = signUpDto;

    // Verify OTP first
    await this.otpService.verifyOtp(email, otpCode, 'SIGNUP');

    // Check if user already exists
    let user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        walletAddress: true,
        role: true,
        createdAt: true,
        isApiAccessApproved: true,
        suspended: true,
      },
    });

    if (user && user.suspended) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    if (user) {
      // Existing user: just log them in
      // Update wallet address if provided and different
      if (walletAddress && user.walletAddress !== walletAddress) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { walletAddress },
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            walletAddress: true,
            role: true,
            createdAt: true,
            isApiAccessApproved: true,
            suspended: true,
          },
        });
      }
    } else {
      // New user: create account (no password needed)
      user = await this.prisma.user.create({
        data: {
          email,
          password: '', // Empty password for email-only auth
          walletAddress,
        },
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          walletAddress: true,
          role: true,
          createdAt: true,
          isApiAccessApproved: true,
          suspended: true,
        },
      });
    }

    // Generate JWT token
    const token = this.generateToken(user?.id, user?.email, user?.role);

    return {
      user,
      accessToken: token,
    };
  }

  /**
   * Sign in an existing user
   *
   * Validates user credentials and returns JWT token.
   *
   * @param signInDto - User login credentials
   * @returns User object (without password) and access token
   */
  async signIn(signInDto: SignInDto) {
    const { email, password } = signInDto;
    const limitKey = `user:${email.toLowerCase()}`;

    if (loginAttemptLimiter.lockedFor(limitKey) > 0) {
      throw new HttpException(TOO_MANY_LOGINS, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always run one bcrypt comparison (real hash, or a dummy for unknown / password-less
    // accounts) so timing and error text never reveal whether the account exists.
    const hash = user?.password || (await DUMMY_PASSWORD_HASH);
    const isPasswordValid = await bcrypt.compare(password, hash);

    if (!user || !user.password || !isPasswordValid) {
      loginAttemptLimiter.recordFailure(limitKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only someone who proved the password is told the account state.
    if (user.suspended) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    loginAttemptLimiter.reset(limitKey);

    // Generate JWT token
    const token = this.generateToken(user.id, user.email, user.role);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken: token,
    };
  }

  /**
   * Admin login
   *
   * Validates admin credentials and returns JWT token.
   *
   * @param adminLoginDto - Admin login credentials
   * @returns Admin object (without password) and access token
   */
  async adminLogin(adminLoginDto: AdminLoginDto) {
    const { email, password } = adminLoginDto;
    const limitKey = `admin:${email.toLowerCase()}`;

    if (loginAttemptLimiter.lockedFor(limitKey) > 0) {
      throw new HttpException(TOO_MANY_LOGINS, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Find admin
    const admin = await this.prisma.admin.findUnique({
      where: { email },
    });

    // Same constant-work comparison as signIn (see DUMMY_PASSWORD_HASH).
    const hash = admin?.password || (await DUMMY_PASSWORD_HASH);
    const isPasswordValid = await bcrypt.compare(password, hash);

    if (!admin || !isPasswordValid) {
      loginAttemptLimiter.recordFailure(limitKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only someone who proved the password is told the account is deactivated.
    if (!admin.isActive) {
      throw new HttpException(
        'Admin account is deactivated',
        HttpStatus.FORBIDDEN,
      );
    }

    loginAttemptLimiter.reset(limitKey);

    // Generate JWT token with ADMIN role
    const token = this.generateToken(admin.id, admin.email, 'ADMIN');

    // Return admin without password
    const { password: _, ...adminWithoutPassword } = admin;

    return {
      user: {
        ...adminWithoutPassword,
        role: 'ADMIN',
      },
      accessToken: token,
    };
  }

  /**
   * Generate JWT token
   *
   * Creates a JWT token with user/admin information.
   *
   * @param userId - User or admin ID
   * @param email - User or admin email
   * @param role - User role (USER or ADMIN)
   * @returns JWT token string
   */
  private generateToken(userId: string, email: string, role: string): string {
    const payload = { userId, email, role };
    return this.jwtService.sign(payload);
  }
}
