import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';

/**
 * Sign Up / Login DTO (Email-only authentication)
 *
 * Simplified authentication: user enters email, receives OTP, verifies and logs in.
 * If user exists, they are logged in. If new user, account is created automatically.
 */
export class SignUpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code for email verification',
  })
  @IsString()
  otpCode: string;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    description: 'User wallet address (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Wallet address must be a valid Stellar public key',
  })
  walletAddress?: string;
}
