import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateUserBankAccountDto {
  @ApiProperty({
    example: '044',
    description: 'Bank code',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Account number',
  })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Account name',
  })
  @IsOptional()
  @IsString()
  accountName?: string;

  @ApiPropertyOptional({
    example: 'Access Bank',
    description: 'Bank name',
  })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({
    example: { branch: 'Victoria Island' },
    description: 'Additional metadata',
  })
  @IsOptional()
  metadata?: any;
}
