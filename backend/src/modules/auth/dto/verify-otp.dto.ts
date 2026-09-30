import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code',
  })
  @IsString()
  code: string;

  @ApiProperty({
    example: 'SIGNUP',
    description: 'Purpose of OTP (SIGNUP, RESET_PASSWORD, etc.)',
    required: false,
    default: 'SIGNUP',
  })
  @IsString()
  @IsOptional()
  purpose?: string = 'SIGNUP';
}

