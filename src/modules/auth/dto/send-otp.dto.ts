import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address to send OTP to',
  })
  @IsEmail()
  email: string;

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

