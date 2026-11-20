import { Module } from '@nestjs/common';
import { MiscController } from './misc.controller';
import { AuthModule } from '../auth/auth.module';
//import { MFBModule } from '../safehaven/safehaven.module'

import { BitNobModule } from '../bitnob/bitnob.module';
import { RampModule } from '../ramp/ramp.module';

@Module({
  imports: [AuthModule, RampModule, BitNobModule],
  controllers: [MiscController],
})
export class MiscModule {}
