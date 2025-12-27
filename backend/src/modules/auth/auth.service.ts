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
  ) {}

  /**
   * Register a new user
   * 
   * Creates a new user account with hashed password.
   * Requires OTP verification before account creation.
   * Email must be unique.
   * 
   * @param signUpDto - User registration data including OTP code
   * @returns User object (without password) and access token
   */
  async signUp(signUpDto: SignUpDto) {
    const { email, password, walletAddress, phoneNumber, otpCode } = signUpDto;

    // Verify OTP first
    await this.otpService.verifyOtp(email, otpCode, 'SIGNUP');

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        walletAddress,
        phoneNumber,
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

    // Verify password
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
      admin: adminWithoutPassword,
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

