import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUrl,
  ValidateIf,
} from 'class-validator';

export class MerchantCreateSubAccountDto {
  @ApiProperty({ example: '08012345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  @IsNotEmpty()
  emailAddress: string;

  @ApiProperty({ example: 'ref-123456' })
  @IsString()
  @IsNotEmpty()
  externalReference: string;

  @ApiPropertyOptional({
    enum: ['NIN', 'vNIN', 'BVN', 'BVNUSSD', 'vID'],
    example: 'BVN',
    description: 'Required for SafeHaven. Ignored for Pulse MFB.',
  })
  @IsEnum(['NIN', 'vNIN', 'BVN', 'BVNUSSD', 'vID'])
  @IsOptional()
  identityType?: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';

  @ApiPropertyOptional({ example: '22222222222' })
  @IsString()
  @IsOptional()
  identityNumber?: string;

  @ApiPropertyOptional({ example: 'id-123' })
  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.identityId !== '' && o.identityId != null)
  identityId?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.otp !== '' && o.otp != null)
  otp?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'SafeHaven only. Ignored for Pulse MFB.',
  })
  @IsBoolean()
  @IsOptional()
  autoSweep?: boolean;
}
