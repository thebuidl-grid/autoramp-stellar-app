import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OtcService } from './otc.service';
import { OtcController } from './otc.controller';
import { MFBModule } from '../safehaven/safehaven.module';
import { HttpModule } from '@nestjs/axios';
import { RampModule } from '../ramp/ramp.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule, MFBModule, HttpModule, RampModule],
  controllers: [OtcController],
  providers: [OtcService],
  exports: [OtcService],
})
export class OtcModule {}
