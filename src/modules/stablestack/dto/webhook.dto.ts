import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Webhook Data DTO
 * 
 * Represents the data object within the webhook payload
 */
class WebhookDataDto {
  @ApiProperty({
    example: 'trx_8147ea6b4fc5a5bf57b222eca3fa',
    description: 'Transaction ID from Flint',
  })
  @IsString()
  transactionId?: string;

  @ApiProperty({
    example: 'trx_ref_Vu1F4nqdPzA2Uj8iMe3H-onramp-another',
    description: 'Transaction reference',
  })
  @IsString()
  reference?: string;

  @ApiProperty({
    example: 'completed',
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    description: 'Transaction status',
  })
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    example: 100,
    description: 'Transaction amount',
  })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Processed amount',
  })
  @IsOptional()
  processedAmount?: number;

  @ApiPropertyOptional({
    example: '0xa8ba937726aef411d104158d374ad3bca4920f0e19edd05a4ed5fa00ed9010a9',
    description: 'Onramp transaction hash (for onramp transactions)',
  })
  @IsOptional()
  @IsString()
  onrampHash?: string;

  @ApiPropertyOptional({
    example: 'base',
    description: 'Network',
  })
  @IsOptional()
  @IsString()
  network?: string;

  @ApiPropertyOptional({
    description: 'Additional webhook data',
  })
  @IsOptional()
  @IsObject()
  depositAccount?: any;
}

/**
 * Webhook DTO
 * 
 * Validates webhook payload from Flint API.
 * Actual structure: { event: string, data: WebhookDataDto }
 */
export class WebhookDto {
  @ApiProperty({
    example: 'onramp.completed',
    description: 'Event type from webhook (e.g., onramp.completed, offramp.completed)',
  })
  @IsString()
  event?: string;

  @ApiProperty({
    type: WebhookDataDto,
    description: 'Transaction data from webhook',
  })
  @ValidateNested()
  @Type(() => WebhookDataDto)
  @IsObject()
  data?: WebhookDataDto;
}

