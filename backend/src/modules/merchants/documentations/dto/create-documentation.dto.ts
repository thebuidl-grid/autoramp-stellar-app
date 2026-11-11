import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateDocumentationDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Merchant ID associated with the documentation',
  })
  @IsUUID()
  @IsNotEmpty()
  merchantId: string;

  @ApiPropertyOptional({ description: 'URL to CAC Certificate' })
  @IsOptional()
  @IsString()
  cacCertificate?: string;

  @ApiPropertyOptional({ description: 'URL to CAC E-Status' })
  @IsOptional()
  @IsString()
  cacEStatus?: string;

  @ApiPropertyOptional({ description: 'URL to MEMART' })
  @IsOptional()
  @IsString()
  memart?: string;

  @ApiPropertyOptional({ description: 'URL to Memorandum' })
  @IsOptional()
  @IsString()
  memorandum?: string;

  @ApiPropertyOptional({ description: 'URL to Proof of Address' })
  @IsOptional()
  @IsString()
  proofOfAddress?: string;

  @ApiPropertyOptional({ description: 'Source of Capital' })
  @IsOptional()
  @IsString()
  capitalSource?: string;

  @ApiPropertyOptional({ description: 'Business Trading Name' })
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiPropertyOptional({ description: 'Tax Identification Number (TIN)' })
  @IsOptional()
  @IsString()
  taxIdentificationNumber?: string;

  @ApiPropertyOptional({ description: 'URL to Proof of Funds' })
  @IsOptional()
  @IsString()
  proofOfFunds?: string;

  @ApiPropertyOptional({
    example: { notes: 'Verified on site' },
    description: 'Additional metadata',
  })
  @IsOptional()
  metadata?: any;
}
