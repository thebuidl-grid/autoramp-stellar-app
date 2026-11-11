import { Module, forwardRef } from '@nestjs/common';
import { SwapService } from './swap.service';
import { SwapController } from './swap.controller';
import { SwapGateway } from './swap.gateway';
import { ConfigModule } from '@nestjs/config';
import { RampModule } from '../ramp/ramp.module';
// import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../merchants/notifications/notifications.module';
import { ZeroExService } from './integrations/zeroex.service';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    forwardRef(() => RampModule), // Forward ref to avoid circular dependency
    // ApiKeysModule,
    AuthModule,
    JwtModule.register({}), // For WebSocket gateway JWT verification
    NotificationsModule,
    HttpModule,
  ],
  controllers: [SwapController],
  providers: [SwapService, SwapGateway, ZeroExService],
  exports: [SwapService, SwapGateway, ZeroExService],
})
export class SwapModule {}
