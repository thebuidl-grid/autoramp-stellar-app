import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class NetworkFeeDto {
  @ApiProperty({ example: 'ethereum', description: 'Blockchain network' })
  @IsString()
  @IsNotEmpty()
  blockchain: string;

  @ApiProperty({ example: 'USDT', description: 'Asset symbol' })
  @IsString()
  @IsNotEmpty()
  asset: string;

  @ApiProperty({ example: 10.5, description: 'Amount to estimate fee for' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({
    example: '0xRecipient...',
    description: 'Destination address',
  })
  @IsString()
  @IsNotEmpty()
  to: string;
}
