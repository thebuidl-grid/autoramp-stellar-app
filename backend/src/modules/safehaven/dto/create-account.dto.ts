import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class CreateMFBAccountDto {
  @ApiProperty({ enum: ['Savings', 'Current'], example: 'Savings' })
  @IsEnum(['Savings', 'Current'])
  @IsNotEmpty()
  accountType: 'Savings' | 'Current';

  @ApiProperty({ example: '01' })
  @IsString()
  @IsNotEmpty()
  suffix: string;

  @ApiProperty({ example: {}, required: false })
  @IsOptional()
  metadata?: any;
}
