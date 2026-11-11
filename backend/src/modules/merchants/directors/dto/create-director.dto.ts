import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateDirectorDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Merchant ID associated with the director',
  })
  @IsUUID()
  @IsNotEmpty()
  merchantId: string;

  @ApiPropertyOptional({
    example: 'John',
    description: 'First name of the director',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'Last name of the director',
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
    example: '22222222222',
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
    example: 'Passport',
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
    example: { role: 'Chairman' },
    description: 'Additional metadata',
  })
  @IsOptional()
  metadata?: any;
}
