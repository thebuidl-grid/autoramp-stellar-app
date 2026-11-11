import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class SwapQuoteDto {
  @ApiProperty({ example: 'USDT', description: 'Asset to swap from' })
  @IsString()
  @IsNotEmpty()
  fromAsset: string;

  @ApiProperty({ example: 'ETH', description: 'Asset to swap to' })
  @IsString()
  @IsNotEmpty()
  toAsset: string;

  @ApiProperty({ example: 100, description: 'Amount to swap' })
  @IsNumber()
  @IsPositive()
  amount: number;
}
