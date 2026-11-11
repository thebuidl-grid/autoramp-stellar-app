import { Module } from '@nestjs/common';
import { RatesController } from './rates.controller';
import { AuthModule } from '../auth/auth.module';
import { BitNobModule } from '../bitnob/bitnob.module';
import { ChainRateService } from './chain-rate.service';

@Module({
  imports: [AuthModule, BitNobModule],
  providers: [ChainRateService],
  controllers: [RatesController],
})
export class RatesModule {}
