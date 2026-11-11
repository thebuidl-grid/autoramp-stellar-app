import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsMerchantGuard } from '../guards/is-merchant.guard';
import { TransactionsService } from './transactions.service';
import { GetMerchantTransactionsDto } from './dto/get-transactions.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Merchant Transactions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, IsMerchantGuard)
@Controller('merchants/:merchantId/transactions')
@ApiParam({ name: 'merchantId', description: 'Merchant ID' })
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('onramp')
  @ApiOperation({ summary: 'Get merchant onramp transactions' })
  async getOnramps(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query() query: GetMerchantTransactionsDto,
    @CurrentUser() user?: any,
  ) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.transactionsService.getOnramps(merchantId, query);
  }

  @Get('offramp')
  @ApiOperation({ summary: 'Get merchant offramp transactions' })
  async getOfframps(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query() query: GetMerchantTransactionsDto,
    @CurrentUser() user?: any,
  ) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.transactionsService.getOfframps(merchantId, query);
  }

  @Get('swap')
  @ApiOperation({ summary: 'Get merchant swap transactions' })
  async getSwaps(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query() query: GetMerchantTransactionsDto,
    @CurrentUser() user?: any,
  ) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.transactionsService.getSwaps(merchantId, query);
  }

  @Get()
  @ApiOperation({
    summary:
      'Get all merchant transactions (onramp, offramp, swap, bank_transfer)',
  })
  async getAll(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query() query: GetMerchantTransactionsDto,
    @CurrentUser() user?: any,
  ) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.transactionsService.getAll(merchantId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get merchant transaction summary' })
  async getSummary(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user?: any,
  ) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.transactionsService.getSummary(merchantId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get merchant transaction analytics' })
  async getAnalytics(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query() query: GetMerchantTransactionsDto,
    @CurrentUser() user?: any,
  ) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.transactionsService.getAnalytics(merchantId, query);
  }
}
