import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class ValidateVerificationDto {
  @ApiProperty({ example: 'id-123' })
  @IsString()
  @IsNotEmpty()
  identityId: string;

  @ApiProperty({ enum: ['BVN', 'NIN'], example: 'BVN' })
  @IsEnum(['BVN', 'NIN'])
  @IsNotEmpty()
  type: 'BVN' | 'NIN';

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  otp: string;
}
