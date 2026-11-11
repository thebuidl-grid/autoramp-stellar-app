import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { VasService } from './vas.service';
import {
  VerifyVasEntityDto,
  PurchaseAirtimeDto,
  PurchaseDataDto,
  PurchaseCableTvDto,
  PayUtilityDto,
} from './dto/vas.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthOrApiKeyGuard } from '../../common/guards/auth-or-api-key.guard';
import { ApiLoggingInterceptor } from '../../common/interceptors/api-logging.interceptor';
import { Throttle } from '@nestjs/throttler';

@ApiTags('VAS')
@Controller('vas')
export class VasController {
  constructor(private readonly vasService: VasService) {}

  @Get('services')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Get all VAS services (Airtime, Data, Cable TV, Utility)',
  })
  @ApiResponse({ status: 200, description: 'List of VAS services' })
  async getServices() {
    return this.vasService.getServices();
  }

  @Get('services/:serviceId')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Get a specific VAS service' })
  @ApiResponse({ status: 200, description: 'VAS service details' })
  async getService(@Param('serviceId') serviceId: string) {
    return this.vasService.getService(serviceId);
  }

  @Get('services/:serviceId/categories')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Get service categories/providers for a VAS service',
  })
  @ApiResponse({ status: 200, description: 'List of categories' })
  async getCategories(@Param('serviceId') serviceId: string) {
    return this.vasService.getCategories(serviceId);
  }

  @Get('categories/:categoryId/products')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Get products/bundles for a category' })
  @ApiResponse({ status: 200, description: 'List of products' })
  async getProducts(@Param('categoryId') categoryId: string) {
    return this.vasService.getProducts(categoryId);
  }

  @Post('verify')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Verify power meter or cable TV smartcard',
    description:
      'Returns customer name for cable TV or meter details for power',
  })
  @ApiBody({ type: VerifyVasEntityDto })
  @ApiResponse({ status: 200, description: 'Verification result' })
  async verifyEntity(@Body() dto: VerifyVasEntityDto) {
    return this.vasService.verifyEntity(dto);
  }

  @Post('pay/airtime')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Purchase airtime' })
  @ApiBody({ type: PurchaseAirtimeDto })
  @ApiResponse({ status: 201, description: 'Airtime purchase initiated' })
  async purchaseAirtime(
    @CurrentUser() user: any,
    @Body() dto: PurchaseAirtimeDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.vasService.purchaseAirtime(user.id, dto, ipAddress, userAgent);
  }

  @Post('pay/data')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Purchase a data bundle' })
  @ApiBody({ type: PurchaseDataDto })
  @ApiResponse({ status: 201, description: 'Data bundle purchase initiated' })
  async purchaseData(
    @CurrentUser() user: any,
    @Body() dto: PurchaseDataDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.vasService.purchaseData(user.id, dto, ipAddress, userAgent);
  }

  @Post('pay/cable-tv')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Purchase a cable TV subscription' })
  @ApiBody({ type: PurchaseCableTvDto })
  @ApiResponse({ status: 201, description: 'Cable TV subscription initiated' })
  async purchaseCableTv(
    @CurrentUser() user: any,
    @Body() dto: PurchaseCableTvDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.vasService.purchaseCableTv(user.id, dto, ipAddress, userAgent);
  }

  @Post('pay/utility')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Pay a utility bill (electricity)' })
  @ApiBody({ type: PayUtilityDto })
  @ApiResponse({ status: 201, description: 'Utility payment initiated' })
  async payUtility(
    @CurrentUser() user: any,
    @Body() dto: PayUtilityDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.vasService.payUtility(user.id, dto, ipAddress, userAgent);
  }

  @Get('transactions')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Get VAS transaction history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of VAS transactions' })
  async getTransactions(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.vasService.getTransactions(user.id, pageNum, limitNum);
  }

  @Get('transactions/:transactionId')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ summary: 'Get a specific VAS transaction' })
  @ApiResponse({ status: 200, description: 'VAS transaction details' })
  async getTransaction(
    @CurrentUser() user: any,
    @Param('transactionId') transactionId: string,
  ) {
    return this.vasService.getTransactionById(user.id, transactionId);
  }

  @Post('transactions/:transactionId/sync')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Sync VAS transaction status from SafeHaven',
    description:
      'Fetches the latest status from SafeHaven and updates local record',
  })
  @ApiResponse({ status: 200, description: 'Transaction status synced' })
  async syncTransaction(
    @CurrentUser() user: any,
    @Param('transactionId') transactionId: string,
  ) {
    return this.vasService.syncTransactionStatus(user.id, transactionId);
  }
}
