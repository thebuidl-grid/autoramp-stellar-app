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
  ) { }

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
      },
    });

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
        },
      });
    }

    // Generate JWT token
    const token = this.generateToken(user.id, user.email, user.role);

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

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password (only if password exists)
    if (!user.password) {
      throw new UnauthorizedException('Please use email verification to sign in');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

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

    // Find admin
    const admin = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if admin is active
    if (!admin.isActive) {
      throw new HttpException(
        'Admin account is deactivated',
        HttpStatus.FORBIDDEN,
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

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
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '24h';

    return this.jwtService.sign(payload, { expiresIn: expiresIn as any });
  }
}

