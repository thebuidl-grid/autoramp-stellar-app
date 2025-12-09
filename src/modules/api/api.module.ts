import { Module } from '@nestjs/common';
import { ApiService } from './api.service';
import { ApiController } from './api.controller';

@Module({
  imports: [],
  controllers: [ApiController],
  providers: [ApiService],
  exports: [ApiService],
})
export class ApiModule {}
