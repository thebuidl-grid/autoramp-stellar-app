import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';

/**
 * Sign Up DTO
 * 
 * Validates user registration data including email, password, and optional wallet address.
 * Password must be at least 8 characters long.
 */
export class SignUpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address (must be unique)',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'User password (minimum 8 characters)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

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

  @ApiProperty({
    example: '+2348012345678',
    description: 'User phone number',
  })
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid international format (e.g., +2348012345678)',
  })
  phoneNumber: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code for email verification',
  })
  @IsString()
  otpCode: string;
}

