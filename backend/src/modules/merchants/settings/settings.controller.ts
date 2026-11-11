import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Param,
  ForbiddenException,
  Patch,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { IsMerchantGuard } from '../guards/is-merchant.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../../../database/prisma.service.js';

@ApiTags('Merchant Settings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, IsMerchantGuard)
@Controller('merchants/:merchantId/settings')
@ApiParam({ name: 'merchantId', description: 'Merchant ID' })
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertAccess(merchantId: string, user: any) {
    if (user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }
  }

  // ── Webhooks ──────────────────────────────────────────

  @Get('webhooks')
  @ApiOperation({ summary: 'List all webhook endpoints' })
  @ApiResponse({ status: 200, description: 'Webhook list' })
  async listWebhooks(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAccess(merchantId, user);
    return this.settingsService.getWebhooks(merchantId);
  }

  @Post('webhooks')
  @ApiOperation({ summary: 'Add a webhook endpoint' })
  @ApiResponse({ status: 201, description: 'Webhook created' })
  async addWebhook(
    @Param('merchantId') merchantId: string,
    @Body() dto: { url: string; label?: string },
    @CurrentUser() user: any,
  ) {
    await this.assertAccess(merchantId, user);
    return this.settingsService.addWebhook(merchantId, dto);
  }

  @Patch('webhooks/:webhookId')
  @ApiOperation({ summary: 'Update a webhook endpoint' })
  @ApiParam({ name: 'webhookId', description: 'Webhook ID' })
  @ApiResponse({ status: 200, description: 'Webhook updated' })
  async updateWebhook(
    @Param('merchantId') merchantId: string,
    @Param('webhookId') webhookId: string,
    @Body() dto: { url?: string; label?: string; active?: boolean },
    @CurrentUser() user: any,
  ) {
    await this.assertAccess(merchantId, user);
    return this.settingsService.updateWebhook(merchantId, webhookId, dto);
  }

  @Delete('webhooks/:webhookId')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  @ApiParam({ name: 'webhookId', description: 'Webhook ID' })
  @ApiResponse({ status: 200, description: 'Webhook deleted' })
  async deleteWebhook(
    @Param('merchantId') merchantId: string,
    @Param('webhookId') webhookId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAccess(merchantId, user);
    return this.settingsService.deleteWebhook(merchantId, webhookId);
  }

  @Post('webhooks/:webhookId/rotate-secret')
  @ApiOperation({ summary: 'Rotate webhook signing secret' })
  @ApiParam({ name: 'webhookId', description: 'Webhook ID' })
  @ApiResponse({ status: 200, description: 'Secret rotated' })
  async rotateSecret(
    @Param('merchantId') merchantId: string,
    @Param('webhookId') webhookId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAccess(merchantId, user);
    return this.settingsService.rotateWebhookSecret(merchantId, webhookId);
  }

  // ── Bank Accounts ─────────────────────────────────────

  @Get('bank-accounts')
  @ApiOperation({ summary: 'Get merchant bank accounts' })
  @ApiResponse({
    status: 200,
    description: 'Bank accounts retrieved successfully',
  })
  async getBankAccounts(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAccess(merchantId, user);
    return this.settingsService.getSettlementAccount(merchantId);
  }

  @Patch('bank-accounts/:id')
  @ApiOperation({ summary: 'Update merchant bank account' })
  @ApiParam({ name: 'id', description: 'Bank account ID' })
  @ApiResponse({
    status: 200,
    description: 'Bank account updated successfully',
  })
  async updateBankAccount(
    @Param('merchantId') merchantId: string,
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: any,
  ) {
    await this.assertAccess(merchantId, user);
    return this.settingsService.updateSettlementAccount(id, dto);
  }
}
