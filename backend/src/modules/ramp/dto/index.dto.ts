import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsPositive,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { SUPPORTED_COUNTRY_CODES } from '../../bitnob/bitnob-countries';
import { OFFRAMP_NETWORK_IDS, ONRAMP_NETWORK_IDS } from '../ramp-chains';

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

  @ApiProperty({ example: 'base', enum: ONRAMP_NETWORK_IDS })
  @IsEnum(ONRAMP_NETWORK_IDS)
  network: string;

  @ApiPropertyOptional({
    example: 'NG',
    enum: SUPPORTED_COUNTRY_CODES,
    description: 'Country of the fiat leg (any network). Defaults to NG.',
  })
  @IsOptional()
  @IsEnum(SUPPORTED_COUNTRY_CODES)
  country?: string;

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

  @ApiProperty({ example: 'base', enum: OFFRAMP_NETWORK_IDS })
  @IsEnum(OFFRAMP_NETWORK_IDS)
  network: string;

  @ApiPropertyOptional({
    example: 'G',
    description:
      'Customer wallet address the deposit is sent from (Stellar public key for stellar, 0x address for base/bsc). Required for all networks.',
  })
  @IsOptional()
  @Matches(/^(G[A-Z2-7]{55}|0x[a-fA-F0-9]{40})$/, {
    message: 'sourceAddress must be a valid Stellar or EVM address',
  })
  sourceAddress?: string;

  @ApiPropertyOptional({
    example: 'NG',
    enum: SUPPORTED_COUNTRY_CODES,
    description: 'Country of the fiat leg (any network). Defaults to NG.',
  })
  @IsOptional()
  @IsEnum(SUPPORTED_COUNTRY_CODES)
  country?: string;

  @ApiPropertyOptional({
    example: 'mainnet',
    enum: ['mainnet', 'testnet'],
    description:
      "Chain network the client is on (its network toggle). Used for Stellar off-ramps over CCTP; defaults to the server's STELLAR_OFFRAMP_NETWORK (mainnet).",
  })
  @IsOptional()
  @IsIn(['mainnet', 'testnet'])
  chainNetwork?: 'mainnet' | 'testnet';

  @ApiProperty({ example: 2000 })
  @IsNumber()
  @IsPositive()
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
