import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

/**
 * Admin Login DTO
 * 
 * Validates admin login credentials (email and password).
 */
export class AdminLoginDto {
  @ApiProperty({
    example: 'admin@example.com',
    description: 'Admin email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: 'AdminPassword123!',
    description: 'Admin password',
  })
  @IsString()
  password: string;
}

