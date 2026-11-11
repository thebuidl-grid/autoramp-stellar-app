import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsObject,
  IsEnum,
} from 'class-validator';

export class MerchantUpdateSubAccountDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Toggle auto-sweep on/off',
  })
  @IsBoolean()
  @IsOptional()
  autoSweep?: boolean;

  @ApiPropertyOptional({
    example: { callbackUrl: 'https://webhook.site/callback' },
  })
  @IsObject()
  @IsOptional()
  autoSweepDetails?: {
    callbackUrl?: string;
  };

  @ApiPropertyOptional({
    example: 'https://webhook.site/callback',
    description:
      'Custom callback URL. Falls back to the platform webhook URL when omitted.',
  })
  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @ApiPropertyOptional({
    example: '123456',
    description:
      'OTP sent to the account holder during identity re-verification.',
  })
  @IsString()
  @IsOptional()
  otp?: string;

  @ApiPropertyOptional({
    enum: ['NIN', 'vNIN', 'BVN', 'BVNUSSD', 'vID'],
    example: 'BVN',
  })
  @IsEnum(['NIN', 'vNIN', 'BVN', 'BVNUSSD', 'vID'])
  @IsOptional()
  identityType?: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';

  @ApiPropertyOptional({ example: '22222222222' })
  @IsString()
  @IsOptional()
  identityNumber?: string;

  @ApiPropertyOptional({ example: 'id-123456' })
  @IsString()
  @IsOptional()
  identityId?: string;

  @ApiPropertyOptional({ example: '+2348000000000' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'merchant@example.com' })
  @IsString()
  @IsOptional()
  emailAddress?: string;
}
