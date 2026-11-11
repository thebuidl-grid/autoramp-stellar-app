import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class PulseMfbCreateAccountDto {
  @ApiProperty({ example: 'Dayo Ojo' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ example: '08055940326' })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @ApiProperty({ example: 'dromah1995@gmail.com' })
  @IsString()
  @IsNotEmpty()
  customerEmail: string;

  @ApiProperty({ example: 'ACC-1234567890' })
  @IsString()
  @IsNotEmpty()
  reference: string;
}
