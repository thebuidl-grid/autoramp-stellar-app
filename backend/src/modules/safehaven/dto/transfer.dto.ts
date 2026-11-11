import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class MFBTransferDto {
  @ApiProperty({ example: '011' })
  @IsString()
  @IsNotEmpty()
  beneficiaryBankCode: string;

  @ApiProperty({ example: '0000000000' })
  @IsString()
  @IsNotEmpty()
  beneficiaryAccountNumber: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 'Payment for services' })
  @IsString()
  @IsNotEmpty()
  narration: string;

  @ApiProperty({ example: 'tx-ref-123' })
  @IsString()
  @IsNotEmpty()
  paymentReference: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  saveBeneficiary?: boolean;

  @ApiProperty({ example: '00000000000' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;
}
