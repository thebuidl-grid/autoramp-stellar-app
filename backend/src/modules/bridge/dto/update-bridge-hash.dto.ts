import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BridgeStep {
  SOURCE_TX = 'SOURCE_TX',
  ATTESTATION = 'ATTESTATION',
  DESTINATION_TX = 'DESTINATION_TX',
}

export class UpdateBridgeHashDto {
  @ApiProperty({
    description: 'Unique reference for the bridge transfer',
    example: 'bridge_123abc',
  })
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiProperty({
    enum: BridgeStep,
    description: 'The step of the bridge process to update',
    example: BridgeStep.SOURCE_TX,
  })
  @IsEnum(BridgeStep)
  @IsNotEmpty()
  step: BridgeStep;

  @ApiProperty({
    description: 'Transaction hash for the given step',
    example: '0xabc123...',
  })
  @IsString()
  @IsNotEmpty()
  hash: string;

  @ApiPropertyOptional({
    description: 'Status of the transaction (defaults to PROCESSING)',
    example: 'SUCCESS',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the update',
    example: { chainId: 1 },
  })
  @IsOptional()
  metadata?: any;
}
