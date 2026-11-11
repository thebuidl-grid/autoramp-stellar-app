import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserBankAccountsService } from './user-bank-accounts.service';
import { CompleteUserBankAccountVerificationDto } from './dto/complete-verification.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('User Bank Accounts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('user/bank-accounts')
export class UserBankAccountsController {
  constructor(private readonly bankAccountsService: UserBankAccountsService) {}

  @Post('initiate-verification')
  @ApiOperation({ summary: 'Initiate bank account verification' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async initiateVerification(
    @Body() body: { email: string },
    @CurrentUser() user: any,
  ) {
    if (!user.isOtcEnabled) {
      throw new ForbiddenException('User is not OTC enabled');
    }
    return this.bankAccountsService.initiateVerification(user.id, body.email);
  }

  @Post('complete-verification')
  @ApiOperation({
    summary: 'Complete bank account verification and create account',
  })
  @ApiResponse({
    status: 201,
    description: 'Bank account created successfully',
  })
  async completeVerification(
    @Body() dto: CompleteUserBankAccountVerificationDto,
    @CurrentUser() user: any,
  ) {
    if (!user.isOtcEnabled) {
      throw new ForbiddenException('User is not OTC enabled');
    }
    return this.bankAccountsService.completeVerification(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all user bank accounts' })
  async findAll(@CurrentUser() user: any) {
    return this.bankAccountsService.findAll(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a bank account' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bankAccountsService.remove(id, user.id);
  }
}
