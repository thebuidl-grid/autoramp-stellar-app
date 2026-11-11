import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class MerchantNameEnquiryDto {
  @ApiProperty({ example: '090286' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}
