import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * Create API Key DTO
 * 
 * Used to create a new API key for authenticated users.
 */
export class CreateApiKeyDto {
  @ApiPropertyOptional({
    example: 'Production API Key',
    description: 'Optional name for the API key (for identification)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Business name associated with this API key',
  })
  @IsOptional()
  @IsString()
  businessName?: string;

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
}

