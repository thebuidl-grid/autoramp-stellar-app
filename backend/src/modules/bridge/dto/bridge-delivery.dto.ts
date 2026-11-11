import { IsString, IsOptional, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BridgeDeliveryDto {
  @ApiProperty({
    description: 'Unique bridge transfer reference',
    example: 'BRG-1707641234567-abc123',
  })
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiProperty({
    description: 'Off-ramp (payout) funding reference this delivery settles',
    example: 'off_1',
  })
  @IsString()
  @IsNotEmpty()
  oframpFundingReference: string;

  @ApiPropertyOptional({
    description: 'Destination chain transaction hash of the delivered USDC',
    example: '0xabc123...',
  })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  destinationTxHash?: string;

  @ApiPropertyOptional({
    description: 'Delivery status (defaults to SUCCESS)',
    example: 'SUCCESS',
  })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  status?: string;

  @ApiPropertyOptional({
    description: 'Amount of USDC delivered across the bridge',
    example: '100.50',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d+\.?\d*$/, {
    message: 'Amount must be a valid number string (e.g., "10.00")',
  })
  amount?: string;
}
