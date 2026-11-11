import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { BridgeService, BridgeDeliveryInput } from './bridge.service';
import { BridgeTransferDto } from './dto/bridge-transfer.dto';
import { BridgeEstimateDto } from './dto/bridge-estimate.dto';
import { UpdateBridgeHashDto } from './dto/update-bridge-hash.dto';
import { BridgeDeliveryDto } from './dto/bridge-delivery.dto';
import {
  BridgeHistoryResponseDto,
  BridgeInitiateResponseDto,
  BridgeStatusResponseDto,
  SupportedChainsResponseDto,
} from './dto/bridge-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Bridge')
@Controller('bridge')
@UseGuards(JwtAuthGuard)
export class BridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  /**
   * Initiate a cross-chain USDC transfer (Returns a reference)
   * POST /bridge/initiate
   */
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Initiate a cross-chain USDC transfer',
    description: 'Returns a reference for the transfer process.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer initiated successfully.',
    type: BridgeInitiateResponseDto,
  })
  async initiateBridge(
    @Body() dto: BridgeTransferDto,
    @CurrentUser() user: any,
  ) {
    return this.bridgeService.initiateBridge(
      dto,
      user?.id,
      user?.merchantId,
      user?.apiKeyId,
    );
  }

  /**
   * Update bridge transaction hash for a specific step
   * POST /bridge/update-hash
   */
  @Post('update-hash')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update bridge transaction hash',
    description:
      'Update the hash for a specific step (SOURCE_TX, ATTESTATION, DESTINATION_TX).',
  })
  @ApiResponse({ status: 200, description: 'Status updated successfully.' })
  async updateHash(@Body() dto: UpdateBridgeHashDto) {
    return this.bridgeService.updateBridgeStatus(
      dto.reference,
      dto.hash,
      dto.step,
      dto.status || 'PROCESSING',
      dto.metadata || {},
    );
  }

  /**
   * Confirm a cross-chain bridge delivery that funds an of-ramp payout.
   * POST /bridge/delivery
   */
  @Post('delivery')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Confirm cross-chain bridge delivery funding an of-ramp payout',
    description:
      'Records a successful bridge delivery (DESTINATION_TX) and mirrors the funding state onto the of-ramp provider order.',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery confirmed successfully.',
  })
  async confirmDelivery(@Body() dto: BridgeDeliveryDto) {
    const payload: BridgeDeliveryInput = {
      reference: dto.reference,
      oframpFundingReference: dto.oframpFundingReference,
      destinationTxHash: dto.destinationTxHash,
      status: dto.status,
      amount: dto.amount,
    };
    return this.bridgeService.confirmDelivery(payload);
  }

  /**
   * Get list of supported chains
   * GET /bridge/supported-chains
   */
  @Public()
  @Get('supported-chains')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get list of supported chains',
    description:
      'Returns an array of chains supported by the bridge. This endpoint is public.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of supported chains returned successfully.',
    type: SupportedChainsResponseDto,
  })
  async getSupportedChains() {
    return this.bridgeService.getSupportedChains();
  }

  /**
   * Check transfer status
   * GET /bridge/status/:reference
   */
  @Get('status/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Check transfer status',
    description:
      'Get the current status of a bridge transfer by its reference.',
  })
  @ApiParam({
    name: 'reference',
    description: 'The unique reference of the transfer',
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer status retrieved successfully.',
    type: BridgeStatusResponseDto,
  })
  async checkStatus(@Param('reference') reference: string) {
    return this.bridgeService.checkTransferStatus(reference);
  }

  /**
   * Get transfer history
   * GET /bridge/history
   */
  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get transfer history',
    description:
      'Returns the bridge transfer history for the current user/merchant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer history retrieved successfully.',
    type: BridgeHistoryResponseDto,
  })
  async getHistory(@CurrentUser() user: any) {
    return this.bridgeService.getTransferHistory(user?.id, user?.merchantId);
  }
}
