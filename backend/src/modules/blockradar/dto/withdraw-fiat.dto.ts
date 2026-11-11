import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class WithdrawFiatDto {
  @ApiProperty({
    example: 'quote_xyz_123',
    description: 'Quote ID from /withdraw-fiat/quote',
  })
  @IsString()
  @IsNotEmpty()
  quoteId: string;

  @ApiProperty({ example: 'inst_abc_456', description: 'Institution/bank ID' })
  @IsString()
  @IsNotEmpty()
  institutionId: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Recipient bank account number',
  })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}
