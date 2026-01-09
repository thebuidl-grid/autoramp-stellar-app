import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Get API Key Statistics DTO
 * 
 * Used to query API key analytics with optional time period grouping.
 */
export class GetApiKeyStatsDto {
    @ApiPropertyOptional({
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Time period for grouping analytics data',
        default: 'daily',
    })
    @IsOptional()
    @IsEnum(['daily', 'weekly', 'monthly'])
    period?: 'daily' | 'weekly' | 'monthly' = 'daily';
}
