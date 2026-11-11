import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';

export class MerchantTransferDto {
  @ApiProperty({ example: '090286' })
  @IsString()
  @IsNotEmpty()
  beneficiaryBankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  beneficiaryAccountNumber: string;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 'Payment for services' })
  @IsString()
  @IsNotEmpty()
  narration: string;

  @ApiProperty({ example: 'ref-123456' })
  @IsString()
  @IsNotEmpty()
  paymentReference: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  saveBeneficiary?: boolean;

  @ApiPropertyOptional({
    example: '0123456789',
    description: 'Account to debit. Defaults to your main account.',
  })
  @IsString()
  @IsOptional()
  debitAccountNumber?: string;
}
