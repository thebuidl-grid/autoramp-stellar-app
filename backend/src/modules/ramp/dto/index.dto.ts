import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

class offRampDestinationDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  accountNumber: string;
}

class OnRampDestinationDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  address: string;
}

export class onRampDto {
  @ApiProperty({ example: 'on', default: 'on' })
  @IsString()
  @IsOptional()
  type: string = 'on';

  @ApiProperty({ example: 'base', enum: ['base', 'bsc', 'stellar'] })
  @IsEnum(['base', 'bsc', 'stellar'])
  network: string;

  @ApiProperty({ example: 2000 })
  @IsNumber()
  @Min(2000)
  amount: number;

  @ApiProperty({ type: OnRampDestinationDto })
  @ValidateNested()
  @Type(() => OnRampDestinationDto)
  @IsObject()
  destination: OnRampDestinationDto;
}

export class offRampDto {
  @ApiProperty({ example: 'off', default: 'off' })
  @IsString()
  @IsOptional()
  type: string = 'off';

  @ApiProperty({ example: 'base', enum: ['base', 'bsc', 'stellar'] })
  @IsEnum(['base', 'bsc', 'stellar'])
  network: string;

  @ApiPropertyOptional({
    example: 'G',
    description:
      'Customer Stellar wallet address that will sign deposit_for_burn. Required when network is stellar.',
  })
  @IsOptional()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'sourceAddress must be a valid Stellar public key',
  })
  sourceAddress?: string;

  @ApiProperty({ example: 2000 })
  @IsNumber()
  @Min(2000)
  amount: number;

  @ApiProperty({ type: offRampDestinationDto })
  @ValidateNested()
  @Type(() => offRampDestinationDto)
  @IsObject()
  destination: offRampDestinationDto;
}

export class ConfirmStellarOfframpDto {
  @ApiProperty({
    example: 'e1a9f3c0...64 hex chars',
    description: 'Stellar transaction hash of the deposit_for_burn call',
  })
  @IsString()
  @Matches(/^(0x)?[0-9a-fA-F]{64}$/, {
    message: 'stellarTxHash must be a Stellar transaction hash',
  })
  stellarTxHash: string;

  @ApiPropertyOptional({
    example: 'G',
    description:
      'Optional: the Stellar wallet that signed the burn — must match the sourceAddress on the order',
  })
  @IsOptional()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'sourceAddress must be a valid Stellar public key',
  })
  sourceAddress?: string;
}
