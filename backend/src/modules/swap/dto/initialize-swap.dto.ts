import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
} from 'class-validator';

/**
 * Offramp destination DTO for swap initialization
 */
class OfframpDestinationDto {
  @ApiProperty({ example: '058', description: 'Bank code' })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: '1234567890', description: 'Account number' })
  @IsString()
  accountNumber: string;
}

/**
 * DTO for initializing a swap transaction
 * Creates offramp first to get recipient address, then creates swap record
 */
export class InitializeSwapDto {
  @ApiProperty({
    example: 140196,
    description: 'NGN amount for offramp (estimated NGN value)',
  })
  @IsNumber()
  @Min(0.000001)
  amount: number;

  @ApiProperty({
    example: 100,
    description: 'USDC amount for swap (amount user wants to swap)',
  })
  @IsNumber()
  @Min(0.0001, { message: 'USDC amount must be positive' })
  usdcAmount: number;

  @ApiProperty({
    example: 0.05,
    description: 'Slippage tolerance (0-1, e.g., 0.05 = 5%)',
  })
  @IsNumber()
  @Min(0)
  slippage: number;

  @ApiProperty({
    type: OfframpDestinationDto,
    description: 'Offramp destination (bank details)',
  })
  @ValidateNested()
  @Type(() => OfframpDestinationDto)
  @IsObject()
  offrampDestination: OfframpDestinationDto;

  @ApiPropertyOptional({
    example: 'base',
    description: 'Network (default: base)',
  })
  @IsOptional()
  @IsString()
  network?: string;
}

