import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class DepositFinderDto {
  @ApiProperty({ example: 'ethereum', description: 'Blockchain network' })
  @IsString()
  @IsNotEmpty()
  blockchain: string;

  @ApiProperty({
    example: '0xabc...',
    description: 'Transaction hash to look up',
  })
  @IsString()
  @IsNotEmpty()
  txHash: string;
}
