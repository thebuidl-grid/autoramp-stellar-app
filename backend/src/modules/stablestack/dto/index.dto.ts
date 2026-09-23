import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
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

  @ApiPropertyOptional({
    example: '+254712345678',
    description:
      'Payer phone number, required only for corridors whose onramp collects via a direct phone push (e.g. KES/M-Pesa) rather than a deposit account.',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class onRampDto {
  @ApiProperty({ example: 'on', default: 'on' })
  @IsString()
  @IsOptional()
  type: string = 'on';

  @ApiProperty({
    example: 'stellar',
    description:
      "Fiat-rail network — always 'stellar' (this is the bank-account-collection leg, not the crypto delivery chain; see payoutChain for that).",
  })
  @IsEnum(['stellar'])
  network: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(100, { message: 'Amount must be at least 100 units of the local currency' })
  amount: number;

  @ApiProperty({ type: OnRampDestinationDto })
  @ValidateNested()
  @Type(() => OnRampDestinationDto)
  @IsObject()
  destination: OnRampDestinationDto;

  @ApiPropertyOptional({
    example: '',
  })
  @IsString()
  @IsOptional()
  notifyUrl?: string;

  @ApiPropertyOptional({
    example: 'NGN',
    description: "Fiat currency (ISO 4217), selects the corridor. Defaults to 'NGN'.",
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 'base',
    default: 'stellar',
    description:
      "Chain to deliver the purchased stablecoin on, as registered in the chain registry (e.g. 'base', 'ethereum', 'stellar'). Defaults to 'stellar' — today's only behavior when combined with an unset payoutTokenCode.",
  })
  @IsOptional()
  @IsString()
  payoutChain?: string;

  @ApiPropertyOptional({
    example: 'USDC',
    description:
      "Stablecoin to deliver — a corridor code (Stellar payoutChain), a ChainToken code (EVM payoutChain), or 'USDC'. Defaults to the corridor's own stablecoin on Stellar.",
  })
  @IsOptional()
  @IsString()
  payoutTokenCode?: string;
}

export class offRampDto {
  @ApiProperty({ example: 'off', default: 'off' })
  @IsString()
  @IsOptional()
  type: string = 'off';

  @ApiProperty({ example: 'stellar' })
  @IsEnum(['stellar'])
  network: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(100, { message: 'Amount must be at least 100 units of the local currency' })
  amount: number;

  @ApiProperty({ type: offRampDestinationDto })
  @ValidateNested()
  @Type(() => offRampDestinationDto)
  @IsObject()
  destination: offRampDestinationDto;

  @ApiPropertyOptional({
    example: '',
  })
  @IsString()
  @IsOptional()
  notifyUrl?: string;

  @ApiPropertyOptional({
    example: 'NGN',
    description: "Fiat currency (ISO 4217), selects the corridor. Defaults to 'NGN'.",
  })
  @IsOptional()
  @IsString()
  currency?: string;
}
