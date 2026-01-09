import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { TransactionDto } from '../dto/transaction.dto';
import { TransactionSummaryDto } from './dto/transaction-summary.dto';
import { GetAnalyticsDto } from './dto/get-analytics.dto';

@ApiTags('Admin')
@Controller()
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) { }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get transaction analytics (volume/count over time)',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Time period for grouping (default: daily)',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics data retrieved successfully',
  })
  async getAnalytics(@Query() query: GetAnalyticsDto) {
    return this.transactionsService.getAnalytics(query);
  }

  @Get('onramps')
  @ApiOperation({ summary: 'Get all on-ramp transactions (for admins)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'A paginated list of on-ramp transactions.',
    type: TransactionDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOnRamps(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    return this.transactionsService.getOnRamps(pageNumber, limitNumber);
  }

  @Get('offramps')
  @ApiOperation({ summary: 'Get all off-ramp transactions (for admins)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'A paginated list of off-ramp transactions.',
    type: TransactionDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOffRamps(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    return this.transactionsService.getOffRamps(pageNumber, limitNumber);
  }

  @Get('swaps')
  @ApiOperation({ summary: 'Get all swap transactions (for admins)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'A paginated list of swap transactions.',
    type: TransactionDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSwaps(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    return this.transactionsService.getSwaps(pageNumber, limitNumber);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get summary statistics for all transactions (for admins)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Summary statistics for on-ramp, off-ramp, and swap transactions.',
    type: TransactionSummaryDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSummary() {
    return this.transactionsService.getSummary();
  }
}
