import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserWalletsService } from './user-wallets.service';
import { CreateUserWalletDto } from './dto/create-wallet.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('User Wallets')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('user/wallets')
export class UserWalletsController {
  constructor(private readonly walletsService: UserWalletsService) {}

  @Post()
  @ApiOperation({ summary: 'Add a new wallet' })
  @ApiResponse({ status: 201, description: 'Wallet added successfully' })
  async create(@Body() dto: CreateUserWalletDto, @CurrentUser() user: any) {
    return this.walletsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all user wallets' })
  async findAll(@CurrentUser() user: any) {
    return this.walletsService.findAll(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a wallet' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.walletsService.remove(id, user.id);
  }
}
