import { Module } from '@nestjs/common';
import { VasController } from './vas.controller';
import { VasService } from './vas.service';
import { MFBModule } from '../safehaven/safehaven.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, MFBModule, AuthModule],
  controllers: [VasController],
  providers: [VasService],
  exports: [VasService],
})
export class VasModule {}
