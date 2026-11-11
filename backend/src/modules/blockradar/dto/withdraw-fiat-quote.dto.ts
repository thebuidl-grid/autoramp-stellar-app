import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class WithdrawFiatQuoteDto {
  @ApiProperty({ example: 100, description: 'Amount to convert' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'USDT', description: 'Source crypto asset' })
  @IsString()
  @IsNotEmpty()
  fromAsset: string;

  @ApiProperty({ example: 'NGN', description: 'Target fiat currency' })
  @IsString()
  @IsNotEmpty()
  toAsset: string;
}
