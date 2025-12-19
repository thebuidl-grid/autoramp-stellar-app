import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * API Keys Controller
 * 
 * This controller is deprecated. API key management has been moved to admin endpoints.
 * See AdminController for API key management.
 */
@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeysController {
  // This controller is kept for backward compatibility but endpoints are moved to admin
}

