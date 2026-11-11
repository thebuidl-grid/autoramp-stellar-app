import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreateUserWalletDto {
  @ApiProperty({
    example: '0x1234567890abcdef1234567890abcdef12345678',
    description: 'Wallet address',
  })
  @IsString()
  @IsNotEmpty()
  // Basic Regex for EVM addresses, can be expanded if needed
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'Invalid wallet address format',
  })
  address: string;

  @ApiProperty({
    example: 'base',
    description: 'Blockchain network (e.g., base, bsc, polygon)',
  })
  @IsString()
  @IsNotEmpty()
  network: string;

  @ApiProperty({
    example: 'Primary Savings',
    description: 'Optional name for the wallet',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;
}
