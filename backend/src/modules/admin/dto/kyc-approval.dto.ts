import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * KYC Approval DTO
 * 
 * Validates KYC approval/rejection data.
 * Used by admins to approve or reject user KYC submissions.
 */
export class KycApprovalDto {
  @ApiProperty({
    example: 'VERIFIED',
    enum: ['VERIFIED', 'REJECTED'],
    description: 'KYC status to set',
  })
  @IsEnum(['VERIFIED', 'REJECTED'])
  status: 'VERIFIED' | 'REJECTED';

  @ApiProperty({
    example: 'Document quality is poor',
    description: 'Rejection reason (required if status is REJECTED)',
    required: false,
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

