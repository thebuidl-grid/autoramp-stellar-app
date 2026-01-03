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
    example: '0x1234567890abcdef1234567890abcdef12345678',
    description: 'User wallet address (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'Wallet address must be a valid Ethereum address',
  })
  walletAddress?: string;
}

