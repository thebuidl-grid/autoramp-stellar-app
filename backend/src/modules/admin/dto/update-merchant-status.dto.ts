import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { MerchantStatus } from '@prisma/client';

/**
 * Update Merchant Status DTO
 *
 * Used by admins to update a merchant's verification status.
 */
export class UpdateMerchantStatusDto {
  @ApiProperty({
    example: 'VERIFIED',
    enum: MerchantStatus,
    description: 'Merchant status to set',
  })
  @IsEnum(MerchantStatus)
  status: MerchantStatus;

  @ApiProperty({
    example: 'Incomplete documentation',
    description: 'Reason for rejection (required if status is REJECTED)',
    required: false,
  })
  @ValidateIf((o) => o.status === 'REJECTED')
  @IsString()
  rejectionReason?: string;
}
