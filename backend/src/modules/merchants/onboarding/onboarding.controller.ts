import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { OnboardingCreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { IsMerchantGuard } from '../guards/is-merchant.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Merchant Onboarding')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('merchants/onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new merchant' })
  @ApiResponse({ status: 201, description: 'Merchant created successfully' })
  async create(
    @Body() dto: OnboardingCreateMerchantDto,
    @CurrentUser() user: any,
  ) {
    if (user.role !== 'ADMIN') {
      dto.userId = user.id;
    }

    return this.onboardingService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all merchants' })
  async findAll(@CurrentUser() user: any) {
    if (user && user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { userId: user.id },
        include: {
          user: { include: { bankAccounts: true } },
          documentations: true,
          directors: true,
          shareholders: true,
        },
      });
      return merchant ? [merchant] : [];
    }

    return this.onboardingService.findAll();
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current merchant profile' })
  async getProfile(@CurrentUser() user: any) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId: user.id },
      include: {
        user: { include: { bankAccounts: true } },
        documentations: true,
        directors: true,
        shareholders: true,
        bankAccount: true,
        subAccounts: true,
      },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get merchant details' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const merchant = await this.onboardingService.findOne(id);
    if (user && user.role !== 'ADMIN') {
      if (merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return merchant;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update merchant details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantDto,
    @CurrentUser() user: any,
  ) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (user && user.role !== 'ADMIN') {
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.onboardingService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a merchant' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (user && user.role !== 'ADMIN') {
      if (!merchant || merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.onboardingService.remove(id);
  }
}
