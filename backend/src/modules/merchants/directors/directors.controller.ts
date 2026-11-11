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
import { DirectorsService } from './directors.service';
import { CreateDirectorDto } from './dto/create-director.dto';
import { UpdateDirectorDto } from './dto/update-director.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';

@ApiTags('Merchant Directors')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('merchants/directors')
export class DirectorsController {
  constructor(
    private readonly directorsService: DirectorsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add a new merchant director' })
  @ApiResponse({ status: 201, description: 'Director added successfully' })
  async create(@Body() dto: CreateDirectorDto, @CurrentUser() user: any) {
    if (user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { userId: user.id },
      });
      if (!merchant)
        throw new ForbiddenException('Merchant account not found for user');
      dto.merchantId = merchant.id;
    }

    return this.directorsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all merchant directors' })
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

    return this.directorsService.findAll(merchantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get director details' })
  async findOne(@Param('id') id: string, @CurrentUser() user?: any) {
    const director = await this.prisma.merchantDirector.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!director) return this.directorsService.findOne(id);
    if (user && user.role !== 'ADMIN') {
      if (director.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return director;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update director details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDirectorDto,
    @CurrentUser() user?: any,
  ) {
    const director = await this.prisma.merchantDirector.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!director) return this.directorsService.update(id, dto);
    if (user && user.role !== 'ADMIN') {
      if (director.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.directorsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a director' })
  async remove(@Param('id') id: string, @CurrentUser() user?: any) {
    const director = await this.prisma.merchantDirector.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!director) return this.directorsService.remove(id);
    if (user && user.role !== 'ADMIN') {
      if (director.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.directorsService.remove(id);
  }
}
