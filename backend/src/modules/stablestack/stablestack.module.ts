import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { StablestackController, WebhookController } from './stablestack.controller';
import { StablestackService } from './stablestack.service';
import { WebhookService } from './webhook.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { SwapModule } from '../swap/swap.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    ApiKeysModule,
    AuthModule,
    forwardRef(() => SwapModule), // Forward ref to avoid circular dependency
  ],
  controllers: [StablestackController, WebhookController],
  providers: [StablestackService, WebhookService],
  exports: [StablestackService, WebhookService],
})
export class StablestackModule {}
