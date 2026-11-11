import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateVirtualAccountDto {
  @ApiProperty({
    example: true,
    description: 'Whether the virtual account is active',
  })
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}
