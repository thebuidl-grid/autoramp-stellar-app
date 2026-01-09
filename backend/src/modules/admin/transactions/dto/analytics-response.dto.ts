import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsDataPoint {
    @ApiProperty()
    date: string;

    @ApiProperty()
    onRampCount: number;

    @ApiProperty()
    offRampCount: number;

    @ApiProperty()
    swapCount: number;

    @ApiProperty()
    onRampVolume: number;

    @ApiProperty()
    offRampVolume: number;

    @ApiProperty()
    swapVolume: number;
}
