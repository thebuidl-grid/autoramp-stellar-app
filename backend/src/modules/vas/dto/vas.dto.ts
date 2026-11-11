import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
} from 'class-validator';

export class VerifyVasEntityDto {
  @ApiProperty({ description: 'Service category ID from SafeHaven' })
  @IsString()
  @IsNotEmpty()
  serviceCategoryId: string;

  @ApiProperty({
    description: 'Card number (cable TV) or meter number (utility)',
  })
  @IsString()
  @IsNotEmpty()
  entityNumber: string;
}

export class PurchaseAirtimeDto {
  @ApiProperty({ description: 'Service category ID from SafeHaven' })
  @IsString()
  @IsNotEmpty()
  serviceCategoryId: string;

  @ApiProperty({ example: 500, description: 'Amount to purchase' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ enum: ['WEB', 'POS', 'ATM'], default: 'WEB' })
  @IsOptional()
  @IsIn(['WEB', 'POS', 'ATM'])
  channel?: string;

  @ApiProperty({ description: 'Debit account number' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;

  @ApiProperty({
    example: '08012345678',
    description: 'Beneficiary phone number',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiPropertyOptional({ description: 'External reference for tracking' })
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiPropertyOptional({ description: 'Status callback URL' })
  @IsOptional()
  @IsString()
  statusUrl?: string;
}

export class PurchaseDataDto {
  @ApiProperty({ description: 'Service category ID from SafeHaven' })
  @IsString()
  @IsNotEmpty()
  serviceCategoryId: string;

  @ApiProperty({ description: 'Data bundle code from products endpoint' })
  @IsString()
  @IsNotEmpty()
  bundleCode: string;

  @ApiProperty({ example: 1000, description: 'Cost of the data bundle' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ enum: ['WEB', 'POS', 'ATM'], default: 'WEB' })
  @IsOptional()
  @IsIn(['WEB', 'POS', 'ATM'])
  channel?: string;

  @ApiProperty({ description: 'Debit account number' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;

  @ApiProperty({
    example: '08012345678',
    description: 'Beneficiary phone number',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiPropertyOptional({ description: 'External reference for tracking' })
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiPropertyOptional({ description: 'Status callback URL' })
  @IsOptional()
  @IsString()
  statusUrl?: string;
}

export class PurchaseCableTvDto {
  @ApiProperty({ description: 'Service category ID from SafeHaven' })
  @IsString()
  @IsNotEmpty()
  serviceCategoryId: string;

  @ApiProperty({ description: 'Cable TV bouquet code from products endpoint' })
  @IsString()
  @IsNotEmpty()
  bundleCode: string;

  @ApiProperty({ example: 5000, description: 'Cost of the subscription' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ enum: ['WEB', 'POS', 'ATM'], default: 'WEB' })
  @IsOptional()
  @IsIn(['WEB', 'POS', 'ATM'])
  channel?: string;

  @ApiProperty({ description: 'Debit account number' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;

  @ApiProperty({ description: 'Cable TV smartcard/IUC number' })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiPropertyOptional({ description: 'External reference for tracking' })
  @IsOptional()
  @IsString()
  externalReference?: string;
}

export class PayUtilityDto {
  @ApiProperty({ description: 'Service category ID from SafeHaven' })
  @IsString()
  @IsNotEmpty()
  serviceCategoryId: string;

  @ApiProperty({ example: 5000, description: 'Amount to pay' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ enum: ['WEB', 'POS', 'ATM'], default: 'WEB' })
  @IsOptional()
  @IsIn(['WEB', 'POS', 'ATM'])
  channel?: string;

  @ApiProperty({ description: 'Debit account number' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;

  @ApiProperty({ description: 'Meter number' })
  @IsString()
  @IsNotEmpty()
  meterNumber: string;

  @ApiProperty({
    description: 'Vend type (returned from verify endpoint)',
  })
  @IsString()
  @IsNotEmpty()
  vendType: string;

  @ApiPropertyOptional({ description: 'External reference for tracking' })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
