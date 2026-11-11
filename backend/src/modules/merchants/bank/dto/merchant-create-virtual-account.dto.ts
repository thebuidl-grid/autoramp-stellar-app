import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  Min,
} from 'class-validator';

export class MerchantCreateVirtualAccountDto {
  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 3600, default: 3600 })
  @IsNumber()
  @IsOptional()
  validFor?: number;

  @ApiPropertyOptional({ example: 'ref-123456' })
  @IsString()
  @IsOptional()
  externalReference?: string;

  @ApiProperty({
    enum: ['Fixed', 'UnderPayment', 'OverPayment'],
    default: 'OverPayment',
  })
  @IsEnum(['Fixed', 'UnderPayment', 'OverPayment'])
  @IsOptional()
  amountControl?: 'Fixed' | 'UnderPayment' | 'OverPayment';
}
