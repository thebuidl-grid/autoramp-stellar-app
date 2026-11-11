import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { MerchantBankService } from '../bank/merchant-bank.service';

@ApiTags('Merchant Status')
@Controller('merchants')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class MerchantStatusController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchantBankService: MerchantBankService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get merchant access status for current user' })
  @ApiResponse({ status: 200, description: 'Merchant status' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async status(@CurrentUser() user: any) {
    const isMerchantFlag = user?.isMerchant;

    const merchant = await this.prisma.merchant.findUnique({
      where: { userId: user?.id },
    });

    return {
      isMerchant: isMerchantFlag,
      onboardingStaus: merchant?.status,
      hasMerchantRecord: !!merchant,
      merchantId: merchant?.id ?? null,
    };
  }

  @Get('onboarded')
  @ApiOperation({
    summary: 'Check if current user has completed merchant onboarding',
  })
  @ApiResponse({ status: 200, description: 'Onboarding progress' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async onboarded(@CurrentUser() user: any) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId: user?.id },
      include: {
        user: { include: { bankAccounts: true } },
        documentations: true,
        directors: true,
        shareholders: true,
      },
    });

    const detailsSubmitted = !!merchant;
    const documentationsSubmitted = (merchant?.documentations?.length ?? 0) > 0;
    const directorsSubmitted = (merchant?.directors?.length ?? 0) > 0;
    const shareholdersSubmitted = (merchant?.shareholders?.length ?? 0) > 0;
    const bankAccountSubmitted =
      (merchant?.user?.bankAccounts?.length ?? 0) > 0;

    const completed =
      detailsSubmitted &&
      documentationsSubmitted &&
      directorsSubmitted &&
      shareholdersSubmitted &&
      bankAccountSubmitted;

    return {
      detailsSubmitted,
      documentationsSubmitted,
      directorsSubmitted,
      shareholdersSubmitted,
      bankAccountSubmitted,
      completed,
      merchantId: merchant?.id ?? null,
    };
  }

  // ── Webhook Delivery Logs ─────────────────────────────────────────────────

  private async getMerchantId(req: any): Promise<string> {
    const user = req.user as { id: string; role?: string } | undefined;
    if (!user?.id) throw new Error('Authentication required');

    const merchantIdFromQuery = req.query?.merchantId as string | undefined;
    if (user.role === 'ADMIN' && merchantIdFromQuery) {
      const m = await this.prisma.merchant.findUnique({
        where: { id: merchantIdFromQuery },
        select: { id: true },
      });
      if (!m) throw new Error('Merchant not found');
      return m.id;
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!merchant) throw new Error('Merchant not found');
    return merchant.id;
  }

  @Get('webhook-logs')
  @ApiOperation({ summary: 'Get webhook delivery history' })
  @ApiResponse({ status: 200, description: 'Webhook logs retrieved' })
  async getWebhookLogs(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('event') event?: string,
    @Query('success') success?: boolean,
  ) {
    return this.merchantBankService.getWebhookLogs(
      await this.getMerchantId(req),
      { page, limit, event, success },
    );
  }

  @Get('webhook-logs/:id')
  @ApiOperation({ summary: 'Get full detail of a single webhook delivery log' })
  @ApiResponse({ status: 200, description: 'Webhook log detail retrieved' })
  async getWebhookLogDetail(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchantBankService.getWebhookLogDetail(
      await this.getMerchantId(req),
      id,
    );
  }

  @Post('webhook-logs/:id/retry')
  @ApiOperation({ summary: 'Retry a failed webhook delivery' })
  @ApiResponse({ status: 200, description: 'Webhook retry initiated' })
  async retryWebhookLog(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchantBankService.retryWebhookLog(
      await this.getMerchantId(req),
      id,
    );
  }
}
