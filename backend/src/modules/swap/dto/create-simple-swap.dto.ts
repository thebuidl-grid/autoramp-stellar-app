import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  Min,
  Matches,
} from 'class-validator';

export class CreateSimpleSwapDto {
  @ApiProperty({
    example: 'USDC',
    description: "Token type to swap from: 'USDC', 'XLM', 'BRIDGE_USDC' (Circle's real USDC), or a corridor stablecoin (e.g. CNGN)",
  })
  @IsString()
  @IsNotEmpty()
  fromTokenType: string;

  @ApiProperty({
    example: 'CNGN',
    description: "Token type to swap to: 'USDC', 'XLM', 'BRIDGE_USDC' (Circle's real USDC), or a corridor stablecoin (e.g. CNGN)",
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

  @ApiProperty({
    example: 1.0,
    description: 'Exchange rate (fromAmount/toAmount)',
  })
  @IsNumber()
  @Min(0.000001)
  exchangeRate: number;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    description: "Source wallet address (user's Stellar public key)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Source address must be a valid Stellar public key',
  })
  sourceAddress: string;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    description:
      "Destination wallet address (user's wallet, same as source for simple swaps)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Destination address must be a valid Stellar public key',
  })
  destinationAddress: string;

  @ApiProperty({
    example: 'stellar',
    description: 'Network (defaults to stellar)',
    required: false,
  })
  @IsString()
  @IsOptional()
  network?: string;

  @ApiProperty({
    example: 0.05,
    description: 'Slippage tolerance (defaults to 0.05 = 5%)',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  slippage?: number;
}
