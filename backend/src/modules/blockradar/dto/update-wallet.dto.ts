import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateWalletDto {
  @ApiProperty({ example: 'My Wallet', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'https://webhook.site/my-hook', required: false })
  @IsString()
  @IsOptional()
  webhookUrl?: string;

  @ApiProperty({ example: 'super-secret', required: false })
  @IsString()
  @IsOptional()
  webhookSecret?: string;
}
