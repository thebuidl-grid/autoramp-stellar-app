import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RegisterBurnDto {
  @ApiProperty({
    example: '0xabc123...',
    description: 'Transaction hash of the depositForBurnWithHook call on the source chain',
  })
  @IsString()
  @Matches(/^(0x)?[a-fA-F0-9]{64}$/, { message: 'burnTxHash must be a 32-byte hex transaction hash' })
  burnTxHash: string;
}
