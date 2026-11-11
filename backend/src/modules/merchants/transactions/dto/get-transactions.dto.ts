import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum AnalyticsPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum TransactionFilterType {
  ONRAMP = 'onramp',
  OFFRAMP = 'offramp',
  SWAP = 'swap',
  BANK_TRANSFER = 'bank_transfer',
}

export class GetMerchantTransactionsDto {
  @ApiPropertyOptional({
    enum: AnalyticsPeriod,
    default: AnalyticsPeriod.DAILY,
  })
  @IsEnum(AnalyticsPeriod)
  @IsOptional()
  period?: AnalyticsPeriod = AnalyticsPeriod.DAILY;

  @ApiPropertyOptional({ enum: TransactionFilterType })
  @IsEnum(TransactionFilterType)
  @IsOptional()
  type?: TransactionFilterType;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 10;
}
