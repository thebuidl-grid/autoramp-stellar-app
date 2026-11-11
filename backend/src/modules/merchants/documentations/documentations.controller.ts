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
import { DocumentationsService } from './documentations.service';
import { CreateDocumentationDto } from './dto/create-documentation.dto';
import { UpdateDocumentationDto } from './dto/update-documentation.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Merchant Documentations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('merchants/documentations')
export class DocumentationsController {
  constructor(
    private readonly documentationsService: DocumentationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add merchant documentation' })
  @ApiResponse({ status: 201, description: 'Documentation added successfully' })
  async create(@Body() dto: CreateDocumentationDto, @CurrentUser() user: any) {
    if (user.role !== 'ADMIN') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { userId: user.id },
      });
      if (!merchant)
        throw new ForbiddenException('Merchant account not found for user');
      dto.merchantId = merchant.id;
    }

    return this.documentationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List merchant documentations' })
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

    return this.documentationsService.findAll(merchantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get documentation details' })
  async findOne(@Param('id') id: string, @CurrentUser() user?: any) {
    const doc = await this.prisma.merchantDocumentation.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!doc) return this.documentationsService.findOne(id);
    if (user && user.role !== 'ADMIN') {
      if (doc.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return doc;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update documentation details' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentationDto,
    @CurrentUser() user?: any,
  ) {
    const doc = await this.prisma.merchantDocumentation.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!doc) return this.documentationsService.update(id, dto);
    if (user && user.role !== 'ADMIN') {
      if (doc.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.documentationsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove documentation' })
  async remove(@Param('id') id: string, @CurrentUser() user?: any) {
    const doc = await this.prisma.merchantDocumentation.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (!doc) return this.documentationsService.remove(id);
    if (user && user.role !== 'ADMIN') {
      if (doc.merchant.userId !== user.id)
        throw new ForbiddenException('Access denied');
    }

    return this.documentationsService.remove(id);
  }
}
