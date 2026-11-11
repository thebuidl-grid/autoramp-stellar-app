import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsMerchantGuard } from '../guards/is-merchant.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateMerchantApiKeyDto } from './dto/create-api-key.dto';
import { UpdateMerchantApiKeyDto } from './dto/update-api-key.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Merchant API Keys')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, IsMerchantGuard)
@Controller('merchants/api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new API key for a merchant' })
  @ApiResponse({ status: 201, description: 'API key generated successfully' })
  async create(@Body() dto: CreateMerchantApiKeyDto, @CurrentUser() user: any) {
    if (user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { userId: user.id },
      });
      if (!merchant)
        throw new ForbiddenException('Merchant account not found for user');
      dto.merchantId = merchant.id;
    }

    return this.apiKeysService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all merchant API keys' })
  @ApiQuery({
    name: 'merchantId',
    required: false,
    description: 'Filter by merchant ID',
  })
  async findAll(
    @Query('merchantId') merchantId?: string,
    @CurrentUser() user?: any,
  ) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { userId: user.id },
      });
      if (!merchant)
        throw new ForbiddenException('Merchant account not found for user');
      merchantId = merchant.id;
    }

    return this.apiKeysService.findAll(merchantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get API key details' })
  async findOne(@Param('id') id: string, @CurrentUser() user?: any) {
    const key = await this.prisma.merchantApiKey.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!key) return this.apiKeysService.findOne(id);
    if (user && user.role !== 'ADMIN') {
      if (key.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return key;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update API key details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantApiKeyDto,
    @CurrentUser() user?: any,
  ) {
    const key = await this.prisma.merchantApiKey.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!key) return this.apiKeysService.update(id, dto);
    if (user && user.role !== 'ADMIN') {
      if (key.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.apiKeysService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke (delete) an API key' })
  async remove(@Param('id') id: string, @CurrentUser() user?: any) {
    const key = await this.prisma.merchantApiKey.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!key) return this.apiKeysService.remove(id);
    if (user && user.role !== 'ADMIN') {
      if (key.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.apiKeysService.remove(id);
  }
}
