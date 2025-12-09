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

class DestinationDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: 'stringstring' })
  @IsString()
  accountNumber: string;
}

export class InitialiseRampDto {
  @ApiProperty({ example: 'off' })
  @IsEnum(['off', 'on'])
  type: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  reference: string;

  @ApiProperty({ example: 'base' })
  @IsString()
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
