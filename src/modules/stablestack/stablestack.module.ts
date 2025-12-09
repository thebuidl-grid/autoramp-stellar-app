import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { StablestackController } from './stablestack.controller';
import { StablestackService } from './stablestack.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [StablestackController],
  providers: [StablestackService],
  exports: [StablestackService],
})
export class StablestackModule {}
