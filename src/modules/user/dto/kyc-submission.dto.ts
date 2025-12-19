import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  Matches,
  IsUrl,
} from 'class-validator';

/**
 * KYC Submission DTO
 * 
 * Validates KYC (Know Your Customer) submission data.
 * All fields are optional to allow partial submissions, but certain fields
 * may be required for verification depending on business rules.
 */
export class KycSubmissionDto {
  // Personal Information
  @ApiPropertyOptional({
    example: 'John',
    description: 'First name',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'Last name',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    example: 'Michael',
    description: 'Middle name',
  })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional({
    example: '1990-01-01',
    description: 'Date of birth (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: 'MALE',
    enum: ['MALE', 'FEMALE', 'OTHER'],
    description: 'Gender',
  })
  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER'])
  gender?: string;

  // Identity Documents
  @ApiPropertyOptional({
    example: '12345678901',
    description: 'Bank Verification Number (11 digits)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, {
    message: 'BVN must be exactly 11 digits',
  })
  bvn?: string;

  @ApiPropertyOptional({
    example: '12345678901',
    description: 'National Identity Number (11 digits)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, {
    message: 'NIN must be exactly 11 digits',
  })
  nin?: string;

  // Address Information
  @ApiPropertyOptional({
    example: '123 Main Street',
    description: 'Address line 1',
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({
    example: 'Apt 4B',
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

  // Next of Kin
  @ApiPropertyOptional({
    example: 'Jane Doe',
    description: 'Next of kin full name',
  })
  @IsOptional()
  @IsString()
  nokFullName?: string;

  @ApiPropertyOptional({
    example: 'Spouse',
    description: 'Next of kin relationship',
  })
  @IsOptional()
  @IsString()
  nokRelationship?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'Next of kin phone number',
  })
  @IsOptional()
  @IsString()
  nokPhoneNumber?: string;

  @ApiPropertyOptional({
    example: '456 Secondary Street, Lagos',
    description: 'Next of kin address',
  })
  @IsOptional()
  @IsString()
  nokAddress?: string;

  // Additional KYC Documents
  @ApiPropertyOptional({
    example: 'passport',
    enum: ['passport', 'drivers_license', 'national_id'],
    description: 'Identity document type',
  })
  @IsOptional()
  @IsEnum(['passport', 'drivers_license', 'national_id'])
  identityDocumentType?: string;

  @ApiPropertyOptional({
    example: 'A12345678',
    description: 'Identity document number',
  })
  @IsOptional()
  @IsString()
  identityDocumentNumber?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/documents/passport.pdf',
    description: 'URL to identity document',
  })
  @IsOptional()
  @IsUrl()
  identityDocumentUrl?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/documents/selfie.jpg',
    description: 'URL to selfie photo',
  })
  @IsOptional()
  @IsUrl()
  selfieUrl?: string;
}

