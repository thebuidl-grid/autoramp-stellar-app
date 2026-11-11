import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MaxLength,
  IsEmail,
  IsNotEmpty,
} from 'class-validator';

/**
 * Create Merchant DTO
 *
 * Used to create a new merchant user and generate their first API key.
 */
export class AdminCreateMerchantDto {
  @ApiProperty({
    example: 'merchant@example.com',
    description: 'Email address of the merchant',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Name of the contact person',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Acme Corp',
    description: 'Business name',
  })
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty({
    example: 'https://acme.com',
    description: 'Business website URL',
  })
  @IsString()
  @IsNotEmpty()
  websiteUrl: string;

  @ApiPropertyOptional({
    description: 'Expected traffic/volume for this API key',
  })
  @IsOptional()
  @IsString()
  trafficEstimate?: string;

  @ApiPropertyOptional({
    description: 'Request limit for this API key',
  })
  @IsOptional()
  @IsString()
  requestLimit?: string;

  @ApiProperty({
    example: '+2348012345678',
    description: 'Phone number of the merchant',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    example: '12345678901',
    description: 'Identity number (NIN/BVN)',
  })
  @IsString()
  @IsNotEmpty()
  identityNumber: string;

  @ApiProperty({
    example: 'NIN',
    description: 'Identity type (NIN/BVN)',
    enum: ['NIN', 'vNIN', 'BVN', 'BVNUSSD', 'vID'],
  })
  @IsString()
  @IsNotEmpty()
  identityType: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';

  @ApiPropertyOptional({
    example: 'SAFEHAVEN',
    description: 'Fiat provider for this merchant (SAFEHAVEN or PULSE_MFB)',
    enum: ['SAFEHAVEN', 'PULSE_MFB'],
  })
  @IsOptional()
  @IsString()
  provider?: 'SAFEHAVEN' | 'PULSE_MFB';
}
