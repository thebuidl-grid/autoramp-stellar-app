import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateAddressDto {
  @ApiProperty({ example: 'https://webhook.site/cb', required: false })
  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @ApiProperty({ example: 'Updated Name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: { userId: '123' }, required: false })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
