import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AdminSafehavenService } from './admin-safehaven.service';
import { CctpQueryDto, SafehavenAccountsQueryDto, SafehavenTransactionsQueryDto } from './safehaven.dto';

/** /admin/safehaven: every Safehaven account we know of, and the money moving through them. Read-only; admins only. */
@ApiTags('Admin')
@Controller('safehaven')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminSafehavenController {
  constructor(private readonly service: AdminSafehavenService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'Virtual, deposit, merchant sub- and main accounts, with activity counts' })
  accounts(@Query() query: SafehavenAccountsQueryDto) {
    return this.service.accounts(query);
  }

  @Get('accounts/:accountNumber')
  @ApiOperation({ summary: 'One account and the events on it' })
  account(@Param('accountNumber') accountNumber: string) {
    return this.service.account(accountNumber);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Safehaven credits and transfers, tied to our transactions where we could' })
  transactions(@Query() query: SafehavenTransactionsQueryDto) {
    return this.service.transactions(query);
  }
}

/** /admin/cctp: bridge transfers over CCTP with their burn and mint progress. Read-only; admins only. */
@ApiTags('Admin')
@Controller('cctp')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminCctpController {
  constructor(private readonly service: AdminSafehavenService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'CCTP / bridge transfers' })
  transactions(@Query() query: CctpQueryDto) {
    return this.service.cctp(query);
  }
}
