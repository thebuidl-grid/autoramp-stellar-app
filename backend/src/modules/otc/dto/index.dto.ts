import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsObject,
  Min,
} from 'class-validator';

export enum OtcIdentityType {
  BVN = 'BVN',
  NIN = 'NIN',
}

export class OnboardOtcDto {
  @IsEnum(OtcIdentityType)
  @IsNotEmpty()
  identityType: OtcIdentityType;

  @IsString()
  @IsNotEmpty()
  identityNumber: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;
}

export class InitiateOtcTransactionDto {
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  network: string;

  @IsOptional()
  @IsString()
  chain?: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class OnRampDestinationDto {
  @IsString()
  @IsNotEmpty()
  address: string;
}

export class OtcOffRampDestinationDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}

export class OtcOffRampQuoteDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsOptional()
  @IsEnum(['base', 'bsc'])
  network?: string;
}

export class OtcOffRampExecuteDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsOptional()
  @IsEnum(['base', 'bsc'])
  network?: string;

  @IsOptional()
  @IsString()
  notifyUrl?: string;

  @IsObject()
  @IsNotEmpty()
  destination: OtcOffRampDestinationDto;
}

export class InitiateOtcOffRampTransactionDto {
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  network: string;

  @IsOptional()
  @IsString()
  chain?: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}

export class OtcOnRampQuoteDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsOptional()
  @IsEnum(['base', 'bsc'])
  network?: string;
}

export class OtcOnRampExecuteDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsOptional()
  @IsEnum(['base', 'bsc'])
  network?: string;

  @IsOptional()
  @IsString()
  notifyUrl?: string;

  @IsObject()
  @IsNotEmpty()
  destination: OnRampDestinationDto;
}
