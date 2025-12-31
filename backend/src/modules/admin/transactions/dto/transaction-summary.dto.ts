
import { ApiProperty } from '@nestjs/swagger';

export class TransactionSummaryDto {
  @ApiProperty({ description: 'Total number of on-ramp transactions' })
  totalOnRamps: number;

  @ApiProperty({ description: 'Total amount of on-ramp transactions' })
  totalOnRampAmount: number;

  @ApiProperty({ description: 'Total number of off-ramp transactions' })
  totalOffRamps: number;

  @ApiProperty({ description: 'Total amount of off-ramp transactions' })
  totalOffRampAmount: number;

  @ApiProperty({ description: 'Total number of swap transactions' })
  totalSwaps: number;

  @ApiProperty({ description: 'Total amount of swap transactions' })
  totalSwapAmount: number;

  @ApiProperty({ description: 'Summary of on-ramp transactions by status' })
  onRampStatusSummary: Record<string, number>;

  @ApiProperty({ description: 'Summary of off-ramp transactions by status' })
  offRampStatusSummary: Record<string, number>;

  @ApiProperty({ description: 'Summary of swap transactions by status' })
  swapStatusSummary: Record<string, number>;
}
