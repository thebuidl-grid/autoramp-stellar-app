import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class NameEnquiryDto {
  @ApiProperty({ example: '011' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '0000000000' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}
