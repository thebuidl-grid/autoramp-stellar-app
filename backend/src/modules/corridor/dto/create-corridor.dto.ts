import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { LicensingStatus } from '@prisma/client';

export class CreateCorridorDto {
  @ApiProperty({ example: 'NG', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode must be an uppercase ISO 3166-1 alpha-2 code' })
  countryCode: string;

  @ApiProperty({ example: 'NGN', description: 'ISO 4217 fiat currency code' })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'fiatCurrency must be an uppercase ISO 4217 code' })
  fiatCurrency: string;

  @ApiProperty({ example: 'CNGN', description: 'Stellar asset code representing this fiat' })
  @IsString()
  @Length(1, 12)
  stablecoinCode: string;

  @ApiProperty({ example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37' })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'stablecoinIssuer must be a valid Stellar public key' })
  stablecoinIssuer: string;

  @ApiProperty({ example: 'flint', description: 'RampProcessor provider key handling this corridor\'s bank rail' })
  @IsString()
  rampProcessorProvider: string;

  @ApiPropertyOptional({ enum: LicensingStatus, default: LicensingStatus.UNLICENSED })
  @IsOptional()
  @IsEnum(LicensingStatus)
  licensingStatus?: LicensingStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
