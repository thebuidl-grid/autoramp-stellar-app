import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class StellarRelayDto {
  @ApiProperty({
    description: 'Burn transaction hash on the source chain (CCTP v2)',
    example:
      '0x4266ef56a833f4df90a5731326e2c018b0c1fc5855b9e4f422d2d2fe16c5e301',
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, { message: 'burnTxHash must be a 0x-prefixed 32-byte hash' })
  burnTxHash: string;

  @ApiProperty({
    description: 'CCTP domain id of the source chain (e.g. 6 = Base, 0 = Ethereum)',
    example: 6,
  })
  @IsInt()
  @Min(0)
  @Max(1000)
  sourceDomain: number;
}
