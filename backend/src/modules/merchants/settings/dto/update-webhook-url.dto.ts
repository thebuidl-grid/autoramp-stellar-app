import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl } from 'class-validator';

export class UpdateWebhookUrlDto {
  @ApiProperty({
    description: 'The URL to receive webhook notifications',
    example: 'https://api.example.com/webhooks',
  })
  @IsNotEmpty()
  @IsUrl()
  webhookUrl: string;
}
