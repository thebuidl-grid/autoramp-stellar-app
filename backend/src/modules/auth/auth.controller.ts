import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { OtpService } from './services/otp.service';
import { SignUpDto, SignInDto, AdminLoginDto, SendOtpDto, VerifyOtpDto } from './dto';
import { Public } from './decorators/public.decorator';

/**
 * Auth Controller
 * 
 * Handles authentication endpoints for users and admins.
 * All endpoints are public (no authentication required).
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Post('signup')
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Sign up or login with email and OTP (simplified auth)' })
  @ApiBody({ type: SignUpDto })
  @ApiResponse({
    status: 201,
    description: 'User signed up or logged in successfully',
    schema: {
      example: {
        user: {
          id: 'uuid',
          email: 'user@example.com',
          phoneNumber: null,
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          role: 'USER',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        accessToken: 'jwt-token-string',
      },
    },
  })
  async signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post('signin')
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in an existing user' })
  @ApiBody({ type: SignInDto })
  @ApiResponse({
    status: 200,
    description: 'User successfully signed in',
    schema: {
      example: {
        user: {
          id: 'uuid',
          email: 'user@example.com',
          phoneNumber: '+2348012345678',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          kycStatus: 'PENDING',
          role: 'USER',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        accessToken: 'jwt-token-string',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password',
  })
  async signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @Post('admin/login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login' })
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Admin successfully logged in',
    schema: {
      example: {
        admin: {
          id: 'uuid',
          email: 'admin@example.com',
          firstName: 'John',
          lastName: 'Doe',
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        accessToken: 'jwt-token-string',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin account is deactivated',
  })
  async adminLogin(@Body() adminLoginDto: AdminLoginDto) {
    return this.authService.adminLogin(adminLoginDto);
  }

  @Post('otp/send')
  @Public()
  @Throttle({ short: { limit: 3, ttl: 60000 } }) // 3 requests per minute (stricter for OTP)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to email' })
  @ApiBody({ type: SendOtpDto })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully to your email',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or rate limit exceeded',
  })
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.otpService.sendOtp(sendOtpDto.email, sendOtpDto.purpose);
  }

  @Post('otp/verify')
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP verified successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP code',
  })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    await this.otpService.verifyOtp(
      verifyOtpDto.email,
      verifyOtpDto.code,
      verifyOtpDto.purpose,
    );
    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }
}

