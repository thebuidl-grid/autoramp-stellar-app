import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class EvmRelayDto {
  @ApiProperty({
    description:
      'Burn transaction hash on Stellar (64 hex characters, with or without 0x)',
    example: 'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
  })
  @IsString()
  @Matches(/^(0x)?[0-9a-fA-F]{64}$/, {
    message: 'burnTxHash must be a 32-byte hash (64 hex characters)',
  })
  burnTxHash: string;
}
