import { ApiProperty } from '@nestjs/swagger';

export class SupportedChainsResponseDto {
  @ApiProperty({
    description: 'List of supported chain names',
    example: [
      'Ethereum',
      'Base',
      'Arbitrum',
      'Optimism',
      'Polygon',
      'Avalanche',
      'Solana',
      'Noble',
      'Linea',
    ],
  })
  chains: string[];
}

export class BridgeInitiateResponseDto {
  @ApiProperty({
    description: 'Unique reference for the bridge transfer',
    example: 'BRG-1707641234567-abc123',
  })
  reference: string;

  @ApiProperty({
    description: 'Current status of the transfer',
    example: 'PENDING',
  })
  status: string;

  @ApiProperty({
    description: 'Source chain name',
    example: 'Ethereum',
  })
  fromChain: string;

  @ApiProperty({
    description: 'Destination chain name',
    example: 'Base',
  })
  toChain: string;

  @ApiProperty({
    description: 'Amount of USDC to bridge',
    example: '100.00',
  })
  amount: string;
}

export class BridgeStatusResponseDto extends BridgeInitiateResponseDto {
  @ApiProperty({
    description: 'Source wallet address',
    example: '0x123...abc',
  })
  sourceAddress: string;

  @ApiProperty({
    description: 'Destination wallet address',
    example: '0x456...def',
  })
  destinationAddress: string;

  @ApiProperty({
    description: 'Main transaction hash (if available)',
    example: '0xabc...123',
    nullable: true,
  })
  transactionHash: string | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-02-11T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-02-11T12:05:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Full metadata of the transfer (step hashes, etc.)',
    example: {
      SOURCE_TX: '0xabc...123',
      ATTESTATION: '0xdef...456',
    },
  })
  metadata: any;
}

export class BridgeHistoryItemDto {
  @ApiProperty({
    description: 'Unique reference for the bridge transfer',
    example: 'BRG-1707641234567-abc123',
  })
  reference: string;

  @ApiProperty({
    description: 'Current status',
    example: 'SUCCESS',
  })
  status: string;

  @ApiProperty({
    description: 'Source chain',
    example: 'Ethereum',
  })
  fromChain: string;

  @ApiProperty({
    description: 'Destination chain',
    example: 'Base',
  })
  toChain: string;

  @ApiProperty({
    description: 'Amount of USDC',
    example: '100.00',
  })
  amount: string;

  @ApiProperty({
    description: 'Transaction hash',
    example: '0xabc...123',
  })
  transactionHash: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-02-11T12:00:00.000Z',
  })
  createdAt: Date;
}

export class BridgeHistoryResponseDto {
  @ApiProperty({
    description: 'Total number of transactions in history',
    example: 12,
  })
  total: number;

  @ApiProperty({
    description: 'List of bridge transactions',
    type: [BridgeHistoryItemDto],
  })
  transactions: BridgeHistoryItemDto[];
}
