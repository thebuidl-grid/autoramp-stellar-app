import {
  Controller,
} from '@nestjs/common';
import {
  ApiTags
} from '@nestjs/swagger';

@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeysController {
  // This controller is kept for backward compatibility but endpoints are moved to admin
}

