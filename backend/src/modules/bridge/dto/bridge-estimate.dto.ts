import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BridgeEstimateDto {
  @ApiProperty({
    description: 'Source chain name',
    example: 'ethereum',
  })
  @IsString()
  @IsNotEmpty()
  fromChain: string;

  @ApiProperty({
    description: 'Destination chain name',
    example: 'base',
  })
  @IsString()
  @IsNotEmpty()
  toChain: string;

  @ApiProperty({
    description: 'Amount of USDC to bridge',
    example: '100.00',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.?\d*$/, {
    message: 'Amount must be a valid number string (e.g., "10.00")',
  })
  amount: string;
}
