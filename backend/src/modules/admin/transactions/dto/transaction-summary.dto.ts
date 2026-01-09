import { ApiProperty } from '@nestjs/swagger';

class SummaryStats {
  @ApiProperty()
  count: number;

  @ApiProperty()
  totalAmount: number;
}

export class TransactionSummaryDto {
  @ApiProperty({ type: SummaryStats })
  onRamps: SummaryStats;

  @ApiProperty({ type: SummaryStats })
  offRamps: SummaryStats;

  @ApiProperty({ type: SummaryStats })
  swaps: SummaryStats;
}
