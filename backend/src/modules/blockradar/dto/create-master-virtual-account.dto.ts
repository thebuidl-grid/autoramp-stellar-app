import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateMasterVirtualAccountDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'Full name for the virtual account',
  })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Bank account number to link (optional)',
    required: false,
  })
  @IsString()
  @IsOptional()
  accountNumber?: string;
}
