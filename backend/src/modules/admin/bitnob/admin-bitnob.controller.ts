import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { BitNobService } from 'src/modules/bitnob/bitnob.service';
import {
  BitnobPayoutsQueryDto,
  BitnobTransactionsQueryDto,
} from './dto/bitnob-queries.dto';

/**
 * Read-only view of our own Bitnob account for the admin dashboard: GET /admin/bitnob/{balances|transactions|payouts}.
 * Bitnob's response is returned as-is (including its `{ success, data }` envelope).
 */
@ApiTags('Admin')
@Controller('bitnob')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminBitnobController {
  constructor(private readonly bitnob: BitNobService) {}

  @Get('balances')
  @ApiOperation({ summary: 'Our Bitnob balances, per currency' })
  balances() {
    return this.bitnob.listBalances();
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Our Bitnob transactions, newest first' })
  transactions(@Query() query: BitnobTransactionsQueryDto) {
    return this.bitnob.listTransactions(query);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Our Bitnob payouts, newest first' })
  payouts(@Query() query: BitnobPayoutsQueryDto) {
    return this.bitnob.listPayouts(query);
  }
}
