import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class MerchantValidateVerificationDto {
  @ApiProperty({ example: 'id-123456' })
  @IsString()
  @IsNotEmpty()
  identityId: string;

  @ApiProperty({
    enum: ['BVN', 'NIN'],
    example: 'BVN',
  })
  @IsEnum(['BVN', 'NIN'])
  @IsNotEmpty()
  type: 'BVN' | 'NIN';

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  otp: string;
}
