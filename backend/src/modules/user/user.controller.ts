import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetApiKeyStatsDto } from '../admin/dto/get-api-key-stats.dto';

/**
 * User Controller
 * 
 * Handles user-related endpoints including:
 * - Profile retrieval
 * 
 * All endpoints require authentication.
 */
@ApiTags('User')
@Controller('user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.id);
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'Get user API keys' })
  @ApiResponse({
    status: 200,
    description: 'User API keys retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getUserApiKeys(@CurrentUser() user: any) {
    return this.userService.getUserApiKeys(user.id);
  }

  @Get('api-keys/stats')
  @ApiOperation({ summary: 'Get user API key statistics' })
  @ApiResponse({
    status: 200,
    description: 'User API key statistics retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getUserApiKeyStats(@CurrentUser() user: any) {
    return this.userService.getUserApiKeyStats(user.id);
  }

  @Get('api-keys/analytics')
  @ApiOperation({ summary: 'Get user API key usage analytics over time' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Time period for grouping (default: daily)',
  })
  @ApiResponse({
    status: 200,
    description: 'User API key analytics retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getUserApiKeyAnalytics(
    @CurrentUser() user: any,
    @Query() query: GetApiKeyStatsDto,
  ) {
    return this.userService.getUserApiKeyAnalytics(user.id, query.period);
  }
}

