import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
} from 'class-validator';

export class CreateSubAccountDto {
  @ApiProperty({ example: '08012345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  @IsNotEmpty()
  emailAddress: string;

  @ApiProperty({ example: 'ref-123456' })
  @IsString()
  @IsNotEmpty()
  externalReference: string;

  @ApiProperty({
    enum: ['NIN', 'vNIN', 'BVN', 'BVNUSSD', 'vID'],
    example: 'BVN',
  })
  @IsEnum(['NIN', 'vNIN', 'BVN', 'BVNUSSD', 'vID'])
  @IsNotEmpty()
  identityType: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';

  @ApiProperty({ example: '22222222222', required: false })
  @IsString()
  @IsOptional()
  identityNumber?: string;

  @ApiProperty({ example: 'id-123', required: false })
  @IsString()
  @IsOptional()
  identityId?: string;

  @ApiProperty({ example: '123456', required: false })
  @IsString()
  @IsOptional()
  otp?: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  autoSweep?: boolean;
}
