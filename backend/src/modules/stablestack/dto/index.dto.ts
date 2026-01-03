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
}

export class onRampDto {
  @ApiProperty({ example: 'on', default: 'on' })
  @IsString()
  @IsOptional()
  type: string = 'on';

  @ApiProperty({ example: 'base' })
  @IsEnum(['base', 'bsc'])
  network: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(100, { message: 'Amount must be at least 100 NGN' })
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
}

export class offRampDto {
  @ApiProperty({ example: 'off', default: 'off' })
  @IsString()
  @IsOptional()
  type: string = 'off';

  @ApiProperty({ example: 'base' })
  @IsEnum(['base', 'bsc'])
  network: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(100, { message: 'Amount must be at least 100 NGN' })
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
}
