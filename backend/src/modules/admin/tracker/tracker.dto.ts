import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TRACKER_SOURCES } from './tracker.sources';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class HealthQueryDto {
  @ApiPropertyOptional({ enum: TRACKER_SOURCES.map((s) => s.type) })
  @IsOptional()
  @IsIn(TRACKER_SOURCES.map((s) => s.type))
  type?: string;

  @ApiPropertyOptional({
    example: 'BITNOB',
    description: 'Only transactions that have a leg with this provider',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;

  @ApiPropertyOptional({
    description:
      'Stuck only: count anything unchanged for this many minutes, ignoring the per-status limits',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 90)
  olderThanMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Stuck only: also list ones untouched for more than STUCK_MAX_AGE_DAYS (default 14), i.e. abandoned',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeAbandoned?: boolean;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class WebhooksQueryDto {
  @ApiPropertyOptional({ example: 'safehaven' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;

  @ApiPropertyOptional({
    description: 'false = events tied to no transaction of ours',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  matched?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  processed?: boolean;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
