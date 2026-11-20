import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Query params the admin Bitnob endpoints accept. The global pipe rejects anything not declared here. */
export class BitnobTransactionsQueryDto {
  @ApiPropertyOptional({ description: 'next_cursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ default: 25, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ example: 'USDT' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  currency?: string;

  @ApiPropertyOptional({ example: 'SETTLED' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ example: 'DEPOSIT_CONFIRMED' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string;

  @ApiPropertyOptional({ example: 'inflow' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  direction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class BitnobPayoutsQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ example: 'success' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ example: 'usdt' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  from_asset?: string;

  @ApiPropertyOptional({ example: 'ngn' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  to_currency?: string;

  @ApiPropertyOptional({ example: 'offchain' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  source?: string;
}
