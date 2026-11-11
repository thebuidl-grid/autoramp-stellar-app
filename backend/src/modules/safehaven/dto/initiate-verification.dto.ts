import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class InitiateVerificationDto {
  @ApiProperty({
    enum: ['BVN', 'NIN', 'vNIN', 'BVNUSSD', 'CAC', 'CREDITCHECK'],
    example: 'BVN',
  })
  @IsEnum(['BVN', 'NIN', 'vNIN', 'BVNUSSD', 'CAC', 'CREDITCHECK'])
  @IsNotEmpty()
  type: 'BVN' | 'NIN' | 'vNIN' | 'BVNUSSD' | 'CAC' | 'CREDITCHECK';

  @ApiProperty({ example: '22222222222' })
  @IsString()
  @IsNotEmpty()
  number: string;

  @ApiProperty({ example: '0000000000' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;

  @ApiProperty({ example: '123456', required: false })
  @IsString()
  @IsOptional()
  otp?: string;

  @ApiProperty({ example: 'verifier-123', required: false })
  @IsString()
  @IsOptional()
  verifierId?: string;

  @ApiProperty({ example: 'provider-abc', required: false })
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  async?: boolean;
}
