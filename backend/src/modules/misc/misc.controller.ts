import {
  BITNOB_COUNTRIES,
  SUPPORTED_COUNTRY_CODES,
  resolveCountry,
} from '../bitnob/bitnob-countries';
import { BitNobService } from '../bitnob/bitnob.service';
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

/**
 * Bitnob bank rows use `code`/`bank_code` and `name`/`bank_name`; clients read the
 * Flint-style `bankCode`/`name`. Return both so existing clients keep working.
 */
export function normalizeBitnobBank(b: any) {
  const bankCode = b?.bankCode ?? b?.bank_code ?? b?.code;
  const name = b?.name ?? b?.bank_name;
  // destinationType tells clients to ask for a phone number (mobile money) instead of a bank account number.
  return { ...b, code: bankCode, bankCode, name, destinationType: b?.destinationType ?? 'bank' };
}

@ApiTags('Misc')
@Controller('misc')
export class MiscController {
  constructor(
    private readonly rampService: RampService,
    private readonly bitnobService: BitNobService,
  ) {}
  @Get('banks')
  @ApiOperation({ summary: 'Get list of supported banks' })
  @ApiQuery({
    name: 'country',
    required: false,
    enum: SUPPORTED_COUNTRY_CODES,
    description:
      'Banks come from Bitnob for every country (NG falls back to the legacy list).',
  })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBankList(@Query('country') country?: string) {
    const cfg = resolveCountry(country);
    // Bitnob is the source for every country so the list, the account lookup
    // and the payout all use the same bank codes.
    const banks = await this.bitnobService.listBanks(cfg.code);
    if (banks.length > 0) {
      return { status: 'success', data: banks.map(normalizeBitnobBank) };
    }
    // Nigeria falls back to the legacy list if Bitnob returned nothing.
    if (cfg.code === 'NG') {
      return this.rampService.getBanks();
    }
    return { status: 'success', data: [] };
  }

  @Get('countries')
  @ApiOperation({ summary: 'Countries supported for on-ramp and off-ramp' })
  getCountries() {
    return {
      status: 'success',
      data: Object.values(BITNOB_COUNTRIES).map(
        ({ code, name, currency, dialCode }) => ({
          code,
          name,
          currency,
          dialCode,
        }),
      ),
    };
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
    @Query('country') country?: string,
  ) {
    const cfg = resolveCountry(country);
    return this.rampService.resolveAccount(
      bankCode,
      accountNumber,
      cfg.code === 'NG' ? undefined : 'stellar',
      cfg.code,
    );
  }
}
