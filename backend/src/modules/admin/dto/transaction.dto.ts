import { ApiProperty } from '@nestjs/swagger';

export class TransactionDto {
  @ApiProperty({ description: 'Transaction ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Transaction Reference' })
  reference: string;

  @ApiProperty({ description: 'Transaction Status' })
  status: string;

  @ApiProperty({
    description: 'Transaction Type',
    enum: ['onramp', 'offramp', 'swap'],
  })
  transactionType: string;

  @ApiProperty({ description: 'Creation Timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last Update Timestamp' })
  updatedAt: Date;

  @ApiProperty({ description: 'Completion Timestamp', required: false })
  completedAt?: Date;

  // On-ramp specific fields
  @ApiProperty({ description: 'On-ramp amount in NGN', required: false })
  amount?: number;

  @ApiProperty({ description: 'On-ramp token amount in CNGN', required: false })
  tokenAmount?: number;

  @ApiProperty({
    description: 'Destination address for on-ramp',
    required: false,
  })
  destinationAddress?: string;

  // Off-ramp specific fields
  @ApiProperty({ description: 'Off-ramp amount in token', required: false })
  amount_offramp?: number; // Renamed to avoid conflict with on-ramp amount

  @ApiProperty({ description: 'Off-ramp fiat amount in NGN', required: false })
  fiatAmount?: number;

  @ApiProperty({ description: 'Bank code for off-ramp', required: false })
  bankCode?: string;

  @ApiProperty({ description: 'Account number for off-ramp', required: false })
  accountNumber?: string;

  // Swap specific fields
  @ApiProperty({ description: 'From token type for swap', required: false })
  fromTokenType?: string;

  @ApiProperty({ description: 'From amount for swap', required: false })
  fromAmount?: number;

  @ApiProperty({ description: 'To token type for swap', required: false })
  toTokenType?: string;

  @ApiProperty({ description: 'To amount for swap', required: false })
  toAmount?: number;

  @ApiProperty({ description: 'Source address for swap', required: false })
  sourceAddress?: string;

  @ApiProperty({ description: 'Destination address for swap', required: false })
  destinationAddress_swap?: string; // Renamed to avoid conflict
}
