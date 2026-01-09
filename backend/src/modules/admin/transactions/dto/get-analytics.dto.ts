import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum AnalyticsPeriod {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    MONTHLY = 'monthly',
}

export class GetAnalyticsDto {
    @ApiPropertyOptional({ enum: AnalyticsPeriod, default: AnalyticsPeriod.DAILY })
    @IsEnum(AnalyticsPeriod)
    @IsOptional()
    period?: AnalyticsPeriod = AnalyticsPeriod.DAILY;
}
