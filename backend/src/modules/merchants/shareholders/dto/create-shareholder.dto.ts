import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateShareholderDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Merchant ID associated with the shareholder',
  })
  @IsUUID()
  @IsNotEmpty()
  merchantId: string;

  @ApiPropertyOptional({
    example: 'Jane',
    description: 'First name of the shareholder',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'Last name of the shareholder',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    example: 'Nigerian',
    description: 'Nationality',
  })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({
    example: '33333333333',
    description: 'Bank Verification Number',
  })
  @IsOptional()
  @IsString()
  bvn?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/proof.pdf',
    description: 'URL to proof of address',
  })
  @IsOptional()
  @IsString()
  proofOfAddress?: string;

  @ApiPropertyOptional({
    example: 'ID Card',
    description: 'Type of ID',
  })
  @IsOptional()
  @IsString()
  idType?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/id.jpg',
    description: 'URL to ID document',
  })
  @IsOptional()
  @IsString()
  idUrl?: string;

  @ApiPropertyOptional({
    example: { ownership_percentage: 51 },
    description: 'Additional metadata',
  })
  @IsOptional()
  metadata?: any;
}
