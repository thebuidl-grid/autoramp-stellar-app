import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class PulseMfbTransferDto {
  @ApiProperty({ example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;

  @ApiProperty({ example: '0987654321' })
  @IsString()
  @IsNotEmpty()
  beneficiaryAccountNumber: string;

  @ApiProperty({ example: '058' })
  @IsString()
  @IsNotEmpty()
  beneficiaryBankCode: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'Test transfer' })
  @IsString()
  @IsNotEmpty()
  narration: string;

  @ApiProperty({ example: 'TXN-1234567890' })
  @IsString()
  @IsNotEmpty()
  reference: string;
}
