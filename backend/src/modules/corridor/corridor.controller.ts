import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CorridorService } from './corridor.service';
import { CreateCorridorDto } from './dto/create-corridor.dto';
import { UpdateCorridorDto } from './dto/update-corridor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * Corridor Registry
 *
 * Admin-managed table of which country/fiat pairs AutoRamp can serve: the
 * local stablecoin representing that fiat on Stellar, which RampProcessor
 * handles the bank rail, and current licensing status. Internal/admin-only —
 * not part of the public merchant API surface.
 */
@ApiTags('Admin - Corridors')
@Controller('admin/corridors')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class CorridorController {
  constructor(private readonly corridorService: CorridorService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new corridor' })
  @ApiResponse({ status: 201, description: 'Corridor created' })
  create(@Body() dto: CreateCorridorDto) {
    return this.corridorService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List corridors' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.corridorService.findAll({ activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a corridor by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.corridorService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a corridor' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCorridorDto) {
    return this.corridorService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a corridor' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.corridorService.remove(id);
  }
}
