import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAnalyticsQueryDto } from './dto/user-analytics-query.dto';
import { UserAnalyticsService } from './user-analytics.service';

@ApiTags('Admin')
@Controller('admin/user-analytics')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class UserAnalyticsController {
  constructor(private readonly analytics: UserAnalyticsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Overall user analytics: growth, active users, activation funnel, transactions, volume, retention (admin)',
  })
  report(@Query() q: UserAnalyticsQueryDto) {
    return this.analytics.report(q.days);
  }
}
