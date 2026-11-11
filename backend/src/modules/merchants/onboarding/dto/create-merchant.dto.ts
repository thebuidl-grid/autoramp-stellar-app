import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsUrl,
  IsUUID,
} from 'class-validator';

export class OnboardingCreateMerchantDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'User ID associated with the merchant',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    example: 'John Doe Enterprise',
    description: 'Unique name of the merchant',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Retail',
    description: 'Nature of the business',
  })
  @IsString()
  @IsNotEmpty()
  natureOfBusiness: string;

  @ApiPropertyOptional({
    example: 'A leading retail company',
    description: 'Description of the business',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'https://johndoeenterprise.com',
    description: 'Business website URL',
  })
  @IsUrl()
  @IsNotEmpty()
  websiteUrl: string;

  @ApiPropertyOptional({
    example: '123 Main St',
    description: 'Address line 1',
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({
    example: 'Suite 100',
    description: 'Address line 2',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({
    example: 'Lagos',
    description: 'City',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: 'Lagos State',
    description: 'State',
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    example: 'Nigeria',
    description: 'Country',
    default: 'Nigeria',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    example: '100001',
    description: 'Postal code',
  })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({
    example: { industry: 'Tech' },
    description: 'Additional metadata',
  })
  @IsOptional()
  metadata?: any;
}
