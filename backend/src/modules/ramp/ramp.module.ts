import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RampController } from './ramp.controller';
import { RampService } from './ramp.service';
import { OfframpExpiryService } from './offramp-expiry.service';
import { PayoutPollService } from './payout-poll.service';
import { WebhookService } from './webhook.service';
import { PaymentCheckService } from './payment-check.service';
import { StellarOfframpRelayService } from './stellar-offramp-relay.service';
import { AuthModule } from '../auth/auth.module';
import { SwapModule } from '../swap/swap.module';
import { NotificationsModule } from '../merchants/notifications/notifications.module';
import { SharedModule } from '../../shared/shared.module';
import { MFBModule } from '../safehaven/safehaven.module';
import { ProvidersModule } from '../providers/providers.module';
import { UserLimitsService } from '../../config/user-limits.service';
import { DatabaseModule } from '../../database/database.module';
import { BitNobModule } from '../bitnob/bitnob.module';
import { OfframpStateModule } from './offramp-state.module';
import { PayoutOrderModule } from './payout-order.repository';

@Module({
  imports: [
    DatabaseModule,
    MFBModule,
    ProvidersModule,
    HttpModule,
    ConfigModule,
    AuthModule,
    forwardRef(() => SwapModule),
    NotificationsModule,
    SharedModule,
    forwardRef(() => BitNobModule),
    OfframpStateModule,
    PayoutOrderModule,
  ],
  controllers: [RampController],
  providers: [
    RampService,
    OfframpExpiryService,
    PayoutPollService,
    WebhookService,
    UserLimitsService,
    PaymentCheckService,
    StellarOfframpRelayService,
  ],
  exports: [RampService, WebhookService, UserLimitsService, StellarOfframpRelayService, PaymentCheckService],
})
export class RampModule {}
