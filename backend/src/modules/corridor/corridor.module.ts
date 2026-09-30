import { Module } from '@nestjs/common';
import { CorridorService } from './corridor.service';
import { CorridorController } from './corridor.controller';

@Module({
  controllers: [CorridorController],
  providers: [CorridorService],
  exports: [CorridorService],
})
export class CorridorModule {}
