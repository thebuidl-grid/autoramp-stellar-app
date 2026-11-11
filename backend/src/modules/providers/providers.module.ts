import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MFBModule } from '../safehaven/safehaven.module';
import { PulseMfbModule } from '../pulsemfb/pulsemfb.module';
import { FiatProviderService } from './fiat-provider.service';

@Global()
@Module({
  imports: [ConfigModule, MFBModule, PulseMfbModule],
  providers: [FiatProviderService],
  exports: [FiatProviderService],
})
export class ProvidersModule {}
