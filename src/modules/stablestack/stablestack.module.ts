import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { StablestackController, WebhookController } from './stablestack.controller';
import { StablestackService } from './stablestack.service';
import { WebhookService } from './webhook.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [HttpModule, ConfigModule, ApiKeysModule, AuthModule],
  controllers: [StablestackController, WebhookController],
  providers: [StablestackService, WebhookService],
  exports: [StablestackService, WebhookService],
})
export class StablestackModule {}
