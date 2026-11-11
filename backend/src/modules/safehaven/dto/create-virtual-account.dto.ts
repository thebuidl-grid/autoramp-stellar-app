import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
} from 'class-validator';

export class CreateVirtualAccountDto {
  @ApiProperty({ example: 3600, description: 'Duration in seconds' })
  @IsNumber()
  @IsNotEmpty()
  validFor: number;

  @ApiProperty({ example: 'https://webhook.site/callback' })
  @IsString()
  @IsNotEmpty()
  callbackUrl: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    enum: ['Fixed', 'UnderPayment', 'OverPayment'],
    example: 'Fixed',
  })
  @IsEnum(['Fixed', 'UnderPayment', 'OverPayment'])
  @IsNotEmpty()
  amountControl: 'Fixed' | 'UnderPayment' | 'OverPayment';

  @ApiProperty({ example: '011', required: false })
  @IsString()
  @IsOptional()
  bankCode?: string;

  @ApiProperty({ example: '0000000000', required: false })
  @IsString()
  @IsOptional()
  accountNumber?: string;
}
