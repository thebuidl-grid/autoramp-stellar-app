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
import { ShareholdersService } from './shareholders.service';
import { CreateShareholderDto } from './dto/create-shareholder.dto';
import { UpdateShareholderDto } from './dto/update-shareholder.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Merchant Shareholders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, IsMerchantGuard)
@Controller('merchants/shareholders')
export class ShareholdersController {
  constructor(
    private readonly shareholdersService: ShareholdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add a new merchant shareholder' })
  @ApiResponse({ status: 201, description: 'Shareholder added successfully' })
  async create(@Body() dto: CreateShareholderDto, @CurrentUser() user: any) {
    if (user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { userId: user.id },
      });
      if (!merchant)
        throw new ForbiddenException('Merchant account not found for user');
      dto.merchantId = merchant.id;
    }

    return this.shareholdersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all merchant shareholders' })
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

    return this.shareholdersService.findAll(merchantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shareholder details' })
  async findOne(@Param('id') id: string, @CurrentUser() user?: any) {
    const shareholder = await this.prisma.merchantShareholder.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!shareholder) return this.shareholdersService.findOne(id);
    if (user && user.role !== 'ADMIN') {
      if (shareholder.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return shareholder;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update shareholder details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateShareholderDto,
    @CurrentUser() user?: any,
  ) {
    const shareholder = await this.prisma.merchantShareholder.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!shareholder) return this.shareholdersService.update(id, dto);
    if (user && user.role !== 'ADMIN') {
      if (shareholder.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.shareholdersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a shareholder' })
  async remove(@Param('id') id: string, @CurrentUser() user?: any) {
    const shareholder = await this.prisma.merchantShareholder.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!shareholder) return this.shareholdersService.remove(id);
    if (user && user.role !== 'ADMIN') {
      if (shareholder.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.shareholdersService.remove(id);
  }
}
