import { Throttle } from '@nestjs/throttler';
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
import { EvmRelayService } from './evm-relay.service';
import { EvmRelayDto } from './dto/evm-relay.dto';
import { BridgeTransferDto } from './dto/bridge-transfer.dto';
import { BridgeEstimateDto } from './dto/bridge-estimate.dto';
import { UpdateBridgeHashDto } from './dto/update-bridge-hash.dto';
import { BridgeDeliveryDto } from './dto/bridge-delivery.dto';
import { StellarRelayDto } from './dto/stellar-relay.dto';
import { StellarRelayService } from './stellar-relay.service';
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
  constructor(
    private readonly bridgeService: BridgeService,
    private readonly stellarRelay: StellarRelayService,
    private readonly evmRelay: EvmRelayService,
  ) {}

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
   * Relay a CCTP burn to Stellar (server pays the fee; the key never reaches the client)
   * POST /bridge/stellar-relay
   */
  @Post('stellar-relay')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Relay a CCTP burn to Stellar (mint_and_forward)',
    description:
      "Returns {status: pending|minting|complete, mintTxHash?}. Poll until complete. Only burns recorded on the calling user's own bridge transfers are relayed (403 otherwise); 30 requests/minute per user.",
  })
  async relayToStellar(@Body() dto: StellarRelayDto, @CurrentUser() user: any) {
    return this.stellarRelay.relay(dto.burnTxHash, dto.sourceDomain, {
      userId: user?.id,
      merchantId: user?.merchantId,
    });
  }

  /**
   * Finish a Stellar -> Base transfer from the relayer when the user's own wallet did not (closed, rejected, left the page).
   * POST /bridge/evm-relay
   */
  @Throttle({ short: { limit: 30, ttl: 60000 }, medium: { limit: 400, ttl: 600000 }, long: { limit: 2000, ttl: 3600000 } })
  @Post('evm-relay')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Relay a Stellar CCTP burn to Base (receiveMessage)',
    description:
      "Returns {status: pending|minting|complete, mintTxHash?}. Poll until complete. Only burns recorded on the calling user's own Stellar to Base transfers are relayed (403 otherwise). The relayer pays the gas; the USDC goes to the transfer's own destination address.",
  })
  async relayToEvm(@Body() dto: EvmRelayDto, @CurrentUser() user: any) {
    return this.evmRelay.relay(dto.burnTxHash, { userId: user?.id, merchantId: user?.merchantId });
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
  // The website polls this every 5 seconds while a transfer is in flight (12 a minute, ~240 over a 20 minute transfer), which the global
  // limits (10 a minute, 100 per 10 minutes) cut off. A polled status endpoint needs more room; it is read-only.
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    medium: { limit: 400, ttl: 600000 },
    long: { limit: 2000, ttl: 3600000 },
  })
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
