import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SwapExecuteDto {
  @ApiProperty({
    example: 'quote_abc123',
    description: 'Quote ID returned from /swap/quote',
  })
  @IsString()
  @IsNotEmpty()
  quoteId: string;
}
