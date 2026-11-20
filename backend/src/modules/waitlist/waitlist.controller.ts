import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import {
  WaitlistListQueryDto,
  WaitlistStatsQueryDto,
} from './dto/waitlist-query.dto';
import { WaitlistService } from './waitlist.service';

/**
 * Country the signup came from, for analytics only. The frontend proxy forwards the visitor's
 * edge country as `x-visitor-country`; direct calls fall back to Cloudflare's `cf-ipcountry`.
 * Either header can be spoofed by a direct caller, so never use this for access decisions.
 */
export function visitorCountry(req: Pick<Request, 'headers'>): string | null {
  const raw = req.headers['x-visitor-country'] ?? req.headers['cf-ipcountry'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase();
  // XX = unknown, T1 = Tor (Cloudflare pseudo-codes)
  return value && /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1'
    ? value
    : null;
}

@ApiTags('Waitlist')
@Controller()
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post('waitlist')
  @Public()
  @HttpCode(200)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Join the waitlist (public, idempotent)' })
  join(@Body() dto: JoinWaitlistDto, @Req() req: Request) {
    return this.waitlist.join(dto, visitorCountry(req));
  }

  @Get('admin/waitlist')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List waitlist signups with timestamps (admin)' })
  list(@Query() q: WaitlistListQueryDto) {
    return this.waitlist.list(q.page, q.limit, q.search);
  }

  @Get('admin/waitlist/export')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT-auth')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="waitlist.csv"')
  @ApiOperation({ summary: 'Download all waitlist signups as CSV (admin)' })
  exportCsv() {
    return this.waitlist.exportCsv();
  }

  @Get('admin/waitlist/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Waitlist analytics: totals, growth, heatmap, sources, conversion (admin)',
  })
  stats(@Query() q: WaitlistStatsQueryDto) {
    return this.waitlist.stats(q.days);
  }
}
