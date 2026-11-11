import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class WhitelistAddressDto {
  @ApiProperty({
    example: '0xAbC123...',
    description: 'Crypto address to whitelist',
  })
  @IsString()
  @IsNotEmpty()
  address: string;
}
