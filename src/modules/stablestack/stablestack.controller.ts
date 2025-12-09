import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { StablestackService } from './stablestack.service';
import { InitialiseRampDto } from './dto/initialise-ramp.dto';

@ApiTags('Stablestack')
@Controller('stablestack')
export class StablestackController {
  constructor(private readonly stablestackService: StablestackService) {}

  @Get('banks')
  @ApiOperation({ summary: 'Get list of banks' })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBanks() {
    return this.stablestackService.getBanks();
  }

  @Post('initialise')
  @ApiOperation({ summary: 'Initialise ramp transaction' })
  @ApiBody({ type: InitialiseRampDto })
  @ApiResponse({ status: 201, description: 'Initialisation response' })
  async initialiseRamp(@Body() dto: InitialiseRampDto) {
    return this.stablestackService.initialiseRamp(dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get ramp transactions' })
  @ApiQuery({ name: 'id', required: false, type: String })
  @ApiQuery({ name: 'reference', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  async getTransactions(
    @Query('id') id?: string,
    @Query('reference') reference?: string,
  ) {
    return this.stablestackService.getTransactions(id, reference);
  }
}
