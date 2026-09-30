import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class BuildBurnTransactionDto {
  @ApiProperty({
    example: 'GABC...',
    description: "The connected Stellar wallet's public key — must match the account that submitted the approve transaction",
  })
  @IsString()
  sourceAddress: string;
}
