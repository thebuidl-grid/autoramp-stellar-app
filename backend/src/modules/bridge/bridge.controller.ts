import { Controller, Get, Post, Body, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { BridgeService } from './bridge.service';
import { ChainRegistryService } from './chain-registry.service';
import { ChainTokenRegistryService } from './chain-token-registry.service';
import { CreateBridgeTransferDto } from './dto/create-bridge-transfer.dto';
import { RegisterBurnDto } from './dto/register-burn.dto';
import { BuildBurnTransactionDto } from './dto/build-burn-transaction.dto';
import { BuildEvmSwapDto } from './dto/build-evm-swap.dto';
import { AuthOrApiKeyGuard } from '../api-keys/guards/auth-or-api-key.guard';
import { ApiLoggingInterceptor } from '../api-keys/interceptors/api-logging.interceptor';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * USDC bridge infra (Phase 1: inbound CCTP transfers into Stellar).
 * Auth via JWT or API key — this is explicitly infra other integrators
 * call, same guard as the stablestack/swap controllers.
 */
@ApiTags('Bridge')
@Controller('bridge')
@UseGuards(AuthOrApiKeyGuard)
@UseInterceptors(ApiLoggingInterceptor)
@ApiBearerAuth('JWT-auth')
@ApiSecurity('API-Key')
export class BridgeController {
  constructor(
    private readonly bridgeService: BridgeService,
    private readonly chainRegistry: ChainRegistryService,
    private readonly chainTokenRegistry: ChainTokenRegistryService,
  ) {}

  @Get('chains')
  @Public()
  @ApiOperation({
    summary: 'List chains the bridge can receive USDC from',
    description: 'Public discovery endpoint — use the returned `name` values as sourceChain in POST /bridge/transfers.',
  })
  @ApiResponse({ status: 200, description: 'Active chains in the registry' })
  async listChains() {
    return this.chainRegistry.findAll({ activeOnly: true });
  }

  @Get('chain-tokens/:chain')
  @Public()
  @ApiOperation({
    summary: 'List bridgeable-in stablecoins for a chain, beyond its own USDC',
    description:
      "Public discovery endpoint for the Swap tab's source-token selector — use the returned `tokenCode` values as sourceTokenCode in POST /bridge/transfers. Empty for a chain with no non-USDC tokens registered (plain-USDC bridging always works regardless).",
  })
  @ApiParam({ name: 'chain', description: "Chain name, e.g. 'base', 'ethereum'" })
  @ApiResponse({ status: 200, description: 'Active tokens registered for this chain' })
  async listChainTokens(@Param('chain') chain: string) {
    return this.chainTokenRegistry.findAll(chain, { activeOnly: true });
  }

  @Get('balance/:chain/:address')
  @Public()
  @ApiOperation({
    summary: 'Read-only USDC balance for an address on a registered chain',
    description: 'Convenience lookup for the Send/Swap UI — never used for anything money-moving.',
  })
  @ApiParam({ name: 'chain', description: "Chain name, e.g. 'base', 'ethereum', 'stellar'" })
  @ApiParam({ name: 'address', description: 'Address to check — 0x for EVM chains, G... for Stellar' })
  @ApiResponse({ status: 200, description: 'USDC balance' })
  async getBalance(@Param('chain') chain: string, @Param('address') address: string) {
    return this.bridgeService.getUsdcBalanceForAddress(chain, address);
  }

  @Post('transfers')
  @ApiOperation({
    summary: 'Register intent to bridge USDC in from another chain',
    description:
      'Returns the exact destinationDomain/mintRecipient/destinationCaller/hookData the caller must use when burning on the source chain via depositForBurnWithHook. mintRecipient and destinationCaller MUST both be set to the returned value or funds are unrecoverable.',
  })
  @ApiBody({ type: CreateBridgeTransferDto })
  @ApiResponse({ status: 201, description: 'Transfer intent created with burn instructions' })
  async createTransfer(@CurrentUser() user: any, @Body() dto: CreateBridgeTransferDto) {
    return this.bridgeService.createTransferIntent(dto, user?.id);
  }

  @Post('evm-swap')
  @ApiOperation({
    summary: 'Build a same-chain swap between two tokens on an EVM chain',
    description:
      "No bridging involved — both tokens stay on chainName throughout. Returns unsigned approve+swap calldata for the caller's own connected wallet to sign, same trust model as every other EVM calldata this module builds.",
  })
  @ApiBody({ type: BuildEvmSwapDto })
  @ApiResponse({ status: 201, description: 'Unsigned approve + swap transactions' })
  async buildEvmSwap(@Body() dto: BuildEvmSwapDto) {
    return this.bridgeService.buildEvmSwap(dto);
  }

  @Post('transfers/:reference/burn-transaction')
  @ApiOperation({
    summary: 'Build the Stellar-source burn transaction (step 2 of 2)',
    description:
      'Stellar-source only. Call this after the approveTransactionXdr from POST /bridge/transfers has been signed and submitted — the burn transaction cannot be built/simulated until that allowance actually exists on-chain.',
  })
  @ApiParam({ name: 'reference', description: 'Bridge transfer reference' })
  @ApiBody({ type: BuildBurnTransactionDto })
  @ApiResponse({ status: 201, description: 'Unsigned burn transaction XDR' })
  async buildBurnTransaction(@Param('reference') reference: string, @Body() dto: BuildBurnTransactionDto) {
    return this.bridgeService.buildBurnTransaction(reference, dto.sourceAddress);
  }

  @Post('transfers/:reference/register-burn')
  @ApiOperation({ summary: 'Report the source-chain burn transaction once submitted' })
  @ApiParam({ name: 'reference', description: 'Bridge transfer reference' })
  @ApiBody({ type: RegisterBurnDto })
  @ApiResponse({ status: 201, description: 'Burn registered; relayer will complete the mint once attested' })
  async registerBurn(@CurrentUser() user: any, @Param('reference') reference: string, @Body() dto: RegisterBurnDto) {
    return this.bridgeService.registerBurn(reference, dto.burnTxHash, user?.id);
  }

  @Post('transfers/:reference/build-destination-swap')
  @ApiOperation({
    summary: 'Build the EVM destination follow-up swap (USDC -> payoutTokenCode)',
    description:
      'Call once the transfer is COMPLETED and has a payoutTokenCode. Returns unsigned approve+swap calldata (a live 0x quote) for the connected wallet on destinationChain to sign — self-custodial, the mint already landed directly in destinationAddress.',
  })
  @ApiParam({ name: 'reference', description: 'Bridge transfer reference' })
  @ApiResponse({ status: 201, description: 'Unsigned approve + swap transactions' })
  async buildDestinationSwap(@Param('reference') reference: string) {
    return this.bridgeService.buildDestinationSwap(reference);
  }

  @Get('transfers/:reference')
  @ApiOperation({ summary: 'Get the status of a bridge transfer' })
  @ApiParam({ name: 'reference', description: 'Bridge transfer reference' })
  @ApiResponse({ status: 200, description: 'Bridge transfer status' })
  async getStatus(@Param('reference') reference: string) {
    return this.bridgeService.getStatus(reference);
  }
}
