import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { generateTrxReference } from 'src/utils/reference.util';

class DestinationDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  @IsOptional()
  bankCode?: string;

  @ApiProperty({ example: 'string' })
  @IsString()
  @IsOptional()
  accountNumber?: string;
}

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

export class InitialiseRampDto {
  @ApiProperty({ example: 'off' })
  @IsEnum(['off', 'on'])
  type: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  reference: string;

  @ApiProperty({ example: 'base' })
  @IsEnum(['base', 'bsc'])
  network: string;

  @ApiProperty({ example: 1206913.6950619982 })
  @IsNumber()
  amount: number;

  @ApiProperty({ type: DestinationDto })
  @ValidateNested()
  @Type(() => DestinationDto)
  @IsObject()
  destination: DestinationDto;

  @ApiPropertyOptional({
    example:
      'http://AZRHGfpffxmK.jbkfVkzn9GLZwzWBAQa98GKt-rs9MBxo7pKCzWuXhaxz8ah1F6O',
  })
  @IsString()
  @IsOptional()
  notifyUrl?: string;
}

export class onRampDto {
  @ApiProperty({ example: 'on', default: 'on' })
  @IsString()
  @IsOptional()
  type: string = 'on';

  @ApiProperty({
    example: generateTrxReference(20),
  })
  @IsString()
  reference: string;

  @ApiProperty({ example: 'base' })
  @IsEnum(['base', 'bsc'])
  network: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
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

  @ApiProperty({
    example: generateTrxReference(20),
  })
  @IsString()
  reference: string;

  @ApiProperty({ example: 'base' })
  @IsEnum(['base', 'bsc'])
  network: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
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
