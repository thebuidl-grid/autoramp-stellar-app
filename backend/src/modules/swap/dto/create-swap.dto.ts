import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';

/**
 * Offramp destination DTO for swap requests
 * Used when swap should trigger an offramp transaction
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
 * DTO for creating a swap transaction
 * Supports swapping USDC to CNGN with optional offramp trigger
 */
export class CreateSwapDto {
  @ApiProperty({
    example: 100,
    description: 'Amount to swap (in token decimals)',
  })
  @IsNumber()
  @Min(0.000001)
  amount: number;

  @ApiProperty({
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Recipient wallet address',
  })
  @IsString()
  recipient: string;

  @ApiProperty({
    example: true,
    description: 'Swap direction: true = USDC to CNGN, false = CNGN to USDC',
  })
  @IsBoolean()
  to_cngn: boolean;

  @ApiProperty({
    example: 0.05,
    description: 'Slippage tolerance (0-1, e.g., 0.05 = 5%)',
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  slippage: number;

  @ApiPropertyOptional({
    type: OfframpDestinationDto,
    description: 'Offramp destination (bank details). If provided, offramp will be triggered after swap completes.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OfframpDestinationDto)
  @IsObject()
  offrampDestination?: OfframpDestinationDto;

  @ApiPropertyOptional({
    example: 'base',
    description: 'Network (default: base)',
  })
  @IsOptional()
  @IsString()
  network?: string;
}

