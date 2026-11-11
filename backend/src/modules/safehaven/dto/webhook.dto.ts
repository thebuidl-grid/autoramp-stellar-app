import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsObject,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class MFBWebhookDataDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  _id?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  paymentReference?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  externalReference?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiProperty()
  @IsString()
  status: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  paymentChannel?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  creditAccountNumber?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  destinationAccountNumber?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  creditAccountName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  destinationAccountName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  debitAccountNumber?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  originatorAccountNumber?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  debitAccountName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  originatorAccountName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  originatorBank?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  destinationBank?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  narration?: string;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  isReversed?: boolean;

  @ApiProperty()
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty()
  @IsObject()
  @IsOptional()
  metadata?: any;

  @ApiProperty()
  @IsString()
  @IsOptional()
  createdAt?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  updatedAt?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  responseCode?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  responseMessage?: string;
}

export class MFBWebhookDto {
  @ApiProperty({
    example: 'virtualAccount.transfer',
    description: 'The type of webhook event',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  event?: string;

  @ApiProperty({
    example: 'account.credit',
    description: 'SafeHaven top-level event discriminator',
  })
  @IsString()
  @IsOptional()
  eventType?: string;

  @ApiProperty()
  @IsObject()
  data: MFBWebhookDataDto;
}
