import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class MerchantBankAccountDto {
  @ApiProperty({ example: '044' })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: 'John Doe Enterprise' })
  @IsString()
  accountName: string;

  @ApiProperty({ example: 'Access Bank' })
  @IsString()
  bankName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: any;
}

export class UpdateMerchantBankAccountDto extends PartialType(
  MerchantBankAccountDto,
) {}
