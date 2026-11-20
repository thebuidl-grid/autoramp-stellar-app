import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ACCOUNT_FILTERS } from './safehaven-queries';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

class PageDto {
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

  @ApiPropertyOptional({ description: 'Search text' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class SafehavenAccountsQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ACCOUNT_FILTERS })
  @IsOptional()
  @IsIn(ACCOUNT_FILTERS as unknown as string[])
  kind?: string;
}

export class SafehavenTransactionsQueryDto extends PageDto {
  @ApiPropertyOptional({ example: 'Completed' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ description: 'true = only ones tied to a transaction of ours, false = only the ones that are not' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  matched?: boolean;
}

export class CctpQueryDto extends PageDto {
  @ApiPropertyOptional({ example: 'FAILED' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}
