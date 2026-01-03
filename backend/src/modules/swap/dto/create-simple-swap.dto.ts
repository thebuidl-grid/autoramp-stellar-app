import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, IsOptional, Min, Matches } from 'class-validator';

export class CreateSimpleSwapDto {
  @ApiProperty({ 
    example: 'USDC', 
    description: 'Token type to swap from (USDC or CNGN)',
    enum: ['USDC', 'CNGN']
  })
  @IsString()
  @IsNotEmpty()
  fromTokenType: string;

  @ApiProperty({ 
    example: 'CNGN', 
    description: 'Token type to swap to (USDC or CNGN)',
    enum: ['USDC', 'CNGN']
  })
  @IsString()
  @IsNotEmpty()
  toTokenType: string;

  @ApiProperty({ example: 100.5, description: 'Amount to swap from' })
  @IsNumber()
  @Min(0.000001, { message: 'Amount must be greater than 0' })
  fromAmount: number;

  @ApiProperty({ example: 100.5, description: 'Estimated amount to receive' })
  @IsNumber()
  @Min(0.000001)
  toAmount: number;

  @ApiProperty({ example: 1.0, description: 'Exchange rate (fromAmount/toAmount)' })
  @IsNumber()
  @Min(0.000001)
  exchangeRate: number;

  @ApiProperty({ 
    example: '0x1234567890abcdef1234567890abcdef12345678', 
    description: 'Source wallet address (user\'s wallet)' 
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Source address must be a valid Ethereum address' })
  sourceAddress: string;

  @ApiProperty({ 
    example: '0x1234567890abcdef1234567890abcdef12345678', 
    description: 'Destination wallet address (user\'s wallet, same as source for simple swaps)' 
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Destination address must be a valid Ethereum address' })
  destinationAddress: string;

  @ApiProperty({ 
    example: 'base', 
    description: 'Network (defaults to base)',
    required: false 
  })
  @IsString()
  @IsOptional()
  network?: string;

  @ApiProperty({ 
    example: 0.05, 
    description: 'Slippage tolerance (defaults to 0.05 = 5%)',
    required: false 
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  slippage?: number;
}
