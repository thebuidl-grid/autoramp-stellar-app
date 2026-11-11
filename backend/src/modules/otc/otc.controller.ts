import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import {
  OnboardOtcDto,
  InitiateOtcTransactionDto,
  InitiateOtcOffRampTransactionDto,
  OtcOnRampQuoteDto,
  OtcOnRampExecuteDto,
  OtcOffRampQuoteDto,
  OtcOffRampExecuteDto,
} from './dto/index.dto';
import { OtcService } from './otc.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OtcGuard } from '../auth/guards/otc.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('OTC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('otc')
export class OtcController {
  constructor(private readonly otcService: OtcService) {}

  @Post('onboard')
  @ApiOperation({ summary: 'Onboard user for OTC feature' })
  @ApiResponse({ status: 201, description: 'User onboarded successfully' })
  async onboard(@Req() req: any, @Body() dto: OnboardOtcDto) {
    return this.otcService.onboardUser(req.user.id, dto);
  }

  @Post('transaction')
  @UseGuards(OtcGuard)
  @ApiOperation({ summary: 'Initiate a new OTC transaction' })
  @ApiResponse({
    status: 201,
    description: 'Transaction initiated successfully',
  })
  async initiateTransaction(
    @Req() req: any,
    @Body() dto: InitiateOtcTransactionDto,
  ) {
    return this.otcService.initiateTransaction(req.user.id, dto);
  }

  @Get('rate')
  @UseGuards(OtcGuard)
  @ApiOperation({ summary: 'Get current OTC exchange rate' })
  @ApiResponse({ status: 200, description: 'Rate retrieved successfully' })
  async getRate(
    @Req() req: any,
    @Query('token') token?: string,
    @Query('network') network?: string,
  ) {
    return this.otcService.getRate(req.user.id, token, network);
  }

  @Get('status/:reference')
  @ApiOperation({ summary: 'Get OTC transaction status' })
  @ApiResponse({ status: 200, description: 'Transaction status retrieved' })
  async getStatus(@Param('reference') reference: string) {
    return this.otcService.getStatus(reference);
  }
  @Get('transactions')
  @ApiOperation({ summary: 'Get all OTC transactions for the user' })
  @ApiResponse({
    status: 200,
    description: 'List of user transactions retrieved',
  })
  async getTransactions(@Req() req: any) {
    return this.otcService.getTransactions(req.user.id);
  }

  @Get('transaction/:id')
  @ApiOperation({ summary: 'Get a single OTC transaction for the user' })
  @ApiResponse({ status: 200, description: 'Transaction details retrieved' })
  async getTransaction(@Req() req: any, @Param('id') id: string) {
    return this.otcService.getTransaction(req.user.id, id);
  }

  @Get('isEnabled')
  @ApiOperation({ summary: 'Check if user is OTC enabled' })
  @ApiResponse({ status: 200, description: 'OTC enablement status retrieved' })
  async checkIsOtcEnabled(@Req() req: any) {
    return this.otcService.checkIsOtcEnabled(req.user.id);
  }

  @Post('onramp/quote')
  @UseGuards(OtcGuard)
  @ApiOperation({ summary: 'Get OTC onramp quote' })
  @ApiBody({ type: OtcOnRampQuoteDto })
  @ApiResponse({ status: 201, description: 'OTC Quote response' })
  async otcOnRampQuote(@Body() dto: OtcOnRampQuoteDto) {
    return this.otcService.otcOnRampQuote(dto);
  }

  @Post('onramp/execute')
  @UseGuards(OtcGuard)
  @ApiOperation({ summary: 'Execute OTC onramp transaction' })
  @ApiBody({ type: OtcOnRampExecuteDto })
  @ApiResponse({ status: 201, description: 'OTC Execution response' })
  async otcOnRampExecute(@Req() req: any, @Body() dto: OtcOnRampExecuteDto) {
    return this.otcService.otcOnRampExecute(req.user.id, dto);
  }

  @Post('offramp/transaction')
  @UseGuards(OtcGuard)
  @ApiOperation({ summary: 'Initiate a new OTC offramp transaction' })
  @ApiResponse({
    status: 201,
    description: 'Offramp transaction initiated successfully',
  })
  async initiateOffRampTransaction(
    @Req() req: any,
    @Body() dto: InitiateOtcOffRampTransactionDto,
  ) {
    return this.otcService.initiateOffRampTransaction(req.user.id, dto);
  }

  @Post('offramp/quote')
  @UseGuards(OtcGuard)
  @ApiOperation({ summary: 'Get OTC offramp quote' })
  @ApiBody({ type: OtcOffRampQuoteDto })
  @ApiResponse({ status: 201, description: 'OTC Offramp Quote response' })
  async otcOffRampQuote(@Body() dto: OtcOffRampQuoteDto) {
    return this.otcService.otcOffRampQuote(dto);
  }

  @Post('offramp/execute')
  @UseGuards(OtcGuard)
  @ApiOperation({ summary: 'Execute OTC offramp transaction' })
  @ApiBody({ type: OtcOffRampExecuteDto })
  @ApiResponse({ status: 201, description: 'OTC Offramp Execution response' })
  async otcOffRampExecute(@Req() req: any, @Body() dto: OtcOffRampExecuteDto) {
    return this.otcService.otcOffRampExecute(req.user.id, dto);
  }
}
