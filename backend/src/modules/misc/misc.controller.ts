import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { UseInterceptors } from '@nestjs/common';

import { RampService } from '../ramp/ramp.service';

import { ApiLoggingInterceptor } from '../../common/interceptors/api-logging.interceptor';
import { AuthOrApiKeyGuard } from '../../common/guards/auth-or-api-key.guard';

@ApiTags('Misc')
@Controller('misc')
export class MiscController {
  constructor(private readonly rampService: RampService) {}
  @Get('banks')
  @ApiOperation({ summary: 'Get list of supported banks' })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBankList() {
    return this.rampService.getBanks();
  }

  @Get('resolve-account')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Resolve account name',
    description:
      'Resolves account name from bank code and account number. Requires authentication (JWT token in Authorization header or API key in x-api-key header).',
  })
  @ApiQuery({
    name: 'bankCode',
    required: true,
    type: String,
    description: 'Bank code',
  })
  @ApiQuery({
    name: 'accountNumber',
    required: true,
    type: String,
    description: 'Account number',
  })
  @ApiResponse({
    status: 200,
    description: 'Account name resolved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async resolveAccount(
    @Query('bankCode') bankCode: string,
    @Query('accountNumber') accountNumber: string,
  ) {
    return this.rampService.resolveAccount(bankCode, accountNumber);
  }
}
