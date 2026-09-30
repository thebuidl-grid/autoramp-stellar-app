import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
    Req,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiQuery,
    ApiBody,
    ApiSecurity,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { StablestackService } from '../stablestack/stablestack.service';
import {
    offRampDto,
    onRampDto,
} from '../stablestack/dto/index.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiLoggingInterceptor } from '../api-keys/interceptors/api-logging.interceptor';

/**
 * Merchant API Controller
 * 
 * Public API endpoints for merchant integrations.
 * All endpoints require API key authentication via x-api-key header.
 */
@ApiTags('Merchant API')
@Controller('api/merchant')
@UseGuards(ApiKeyGuard)
@UseInterceptors(ApiLoggingInterceptor)
@ApiSecurity('API-Key')
export class MerchantApiController {
    constructor(private readonly stablestackService: StablestackService) { }

    @Get('banks')
    @ApiOperation({
        summary: 'Get list of supported banks',
        description: 'Returns all Nigerian banks supported for offramp transactions. Requires API key authentication.',
    })
    @ApiResponse({ status: 200, description: 'List of banks' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing API key' })
    async getBanks() {
        return this.stablestackService.getBanks();
    }

    @Get('resolve-account')
    @ApiOperation({
        summary: 'Resolve bank account',
        description: 'Verify a bank account and get the account holder name. Requires API key authentication.',
    })
    @ApiQuery({ name: 'bankCode', required: true, type: String, description: 'Bank code from /banks endpoint' })
    @ApiQuery({ name: 'accountNumber', required: true, type: String, description: '10-digit account number' })
    @ApiResponse({ status: 200, description: 'Account resolved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 400, description: 'Bad request' })
    async resolveAccount(
        @Query('bankCode') bankCode: string,
        @Query('accountNumber') accountNumber: string,
    ) {
        return this.stablestackService.resolveAccount(bankCode, accountNumber);
    }

    @Post('onramp')
    @Throttle({ medium: { limit: 20, ttl: 600000 } }) // 20 requests per 10 minutes
    @ApiOperation({
        summary: 'Create onramp transaction (NGN → CNGN)',
        description: 'Convert Nigerian Naira to CNGN. User pays NGN to a virtual account and receives CNGN at the specified wallet address. Requires API key authentication.',
    })
    @ApiBody({ type: onRampDto })
    @ApiResponse({ status: 201, description: 'Onramp transaction created' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async onRamp(
        @CurrentUser() user: any,
        @Body() dto: onRampDto,
        @Req() req: Request,
    ) {
        const ipAddress = req.ip || req.socket.remoteAddress;
        const userAgent = req.get('user-agent');
        return this.stablestackService.onRamp(user.id, dto, ipAddress, userAgent);
    }

    @Post('offramp')
    @Throttle({ medium: { limit: 20, ttl: 600000 } }) // 20 requests per 10 minutes
    @ApiOperation({
        summary: 'Create offramp transaction (CNGN → NGN)',
        description: 'Convert CNGN to Nigerian Naira. Send CNGN to the deposit address and receive NGN in the specified bank account. Requires API key authentication.',
    })
    @ApiBody({ type: offRampDto })
    @ApiResponse({ status: 201, description: 'Offramp transaction created' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async offRamp(
        @CurrentUser() user: any,
        @Body() dto: offRampDto,
        @Req() req: Request,
    ) {
        const ipAddress = req.ip || req.socket.remoteAddress;
        const userAgent = req.get('user-agent');
        return this.stablestackService.offRamp(user.id, dto, ipAddress, userAgent);
    }

    @Get('transactions')
    @ApiOperation({
        summary: 'Get merchant transactions',
        description: 'Get a paginated list of your transactions. Filter by ID or reference. Requires API key authentication.',
    })
    @ApiQuery({ name: 'id', required: false, type: String, description: 'Filter by transaction ID' })
    @ApiQuery({ name: 'reference', required: false, type: String, description: 'Filter by transaction reference' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
    @ApiResponse({ status: 200, description: 'List of transactions' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getTransactions(
        @CurrentUser() user: any,
        @Query('id') id?: string,
        @Query('reference') reference?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        return this.stablestackService.getTransactions(user.id, id, reference, pageNum, limitNum);
    }
}
