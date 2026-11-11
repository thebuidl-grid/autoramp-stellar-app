import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ResendWebhookDto {
  @ApiProperty({
    example: 'txn_abc123',
    description: 'Transaction ID to resend webhook for',
  })
  @IsString()
  @IsNotEmpty()
  id: string;
}
