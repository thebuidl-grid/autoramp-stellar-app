import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UserAnalyticsController } from './user-analytics.controller';
import { UserAnalyticsService } from './user-analytics.service';

@Module({
  imports: [DatabaseModule],
  controllers: [UserAnalyticsController],
  providers: [UserAnalyticsService],
})
export class UserAnalyticsModule {}
