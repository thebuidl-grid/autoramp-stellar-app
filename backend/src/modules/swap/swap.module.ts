import { Module, forwardRef } from '@nestjs/common';
import { SwapService } from './swap.service';
import { SwapController } from './swap.controller';
import { SwapGateway } from './swap.gateway';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { StablestackModule } from '../stablestack/stablestack.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    forwardRef(() => StablestackModule), // Forward ref to avoid circular dependency
    ApiKeysModule,
    AuthModule,
    JwtModule.register({}), // For WebSocket gateway JWT verification
  ],
  controllers: [SwapController],
  providers: [SwapService, SwapGateway],
  exports: [SwapService, SwapGateway],
})
export class SwapModule {}
