import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class GenerateAddressDto {
  @ApiProperty({ example: 'ethereum', description: 'Blockchain network' })
  @IsString()
  @IsNotEmpty()
  blockchain: string;

  @ApiProperty({ example: 'Customer Wallet', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'https://webhook.site/cb', required: false })
  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @ApiProperty({ example: { userId: '123' }, required: false })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
