import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BridgeTransferDto {
  @ApiProperty({
    description: 'Source chain name',
    example: 'Ethereum',
  })
  @IsString()
  @IsNotEmpty()
  fromChain: string;

  @ApiProperty({
    description: 'Destination chain name',
    example: 'Base',
  })
  @IsString()
  @IsNotEmpty()
  toChain: string;

  @ApiProperty({
    description: 'Amount of USDC to bridge',
    example: '100.50',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.?\d*$/, {
    message: 'Amount must be a valid number string (e.g., "10.00")',
  })
  amount: string;

  @ApiPropertyOptional({
    description:
      'Destination wallet address (EVM 0x… or Stellar G…). Defaults to source if not provided.',
    example: '0x1234567890123456789012345678901234567890',
  })
  @IsString()
  @IsOptional()
  @Matches(/^(0x[a-fA-F0-9]{40}|G[A-Z2-7]{55}|[1-9A-HJ-NP-Za-km-z]{32,44})$/, {
    message: 'Invalid wallet address format (expected EVM 0x…, Stellar G…, or Solana base58)',
  })
  destinationAddress?: string;

  @ApiPropertyOptional({
    description: 'Source wallet address (EVM 0x… or Stellar G…)',
    example: '0x1234567890123456789012345678901234567890',
  })
  @IsString()
  @IsOptional()
  @Matches(/^(0x[a-fA-F0-9]{40}|G[A-Z2-7]{55}|[1-9A-HJ-NP-Za-km-z]{32,44})$/, {
    message: 'Invalid wallet address format (expected EVM 0x…, Stellar G…, or Solana base58)',
  })
  sourceAddress?: string;

  @ApiPropertyOptional({
    description:
      'Off-ramp provider order reference this bridge funds (e.g. off_…). When set, the order is linked to the bridge leg at initiate so its payout expiry is held while the bridge is in flight.',
    example: 'off_1720000000000_abc123',
  })
  @IsString()
  @IsOptional()
  offrampReference?: string;

  @ApiPropertyOptional({
    description:
      'When true, only create/return the transaction record. The caller executes the bridge client-side (wallet-signed). Omit to let the service execute with its configured signing key.',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  recordOnly?: boolean;
}
