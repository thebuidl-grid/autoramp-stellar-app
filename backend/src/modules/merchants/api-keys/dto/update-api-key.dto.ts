import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMerchantApiKeyDto {
  @ApiPropertyOptional({
    example: 'Updated Key Name',
    description: 'Optional name for the API key',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the API key is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
