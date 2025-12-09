import { Module } from '@nestjs/common';
import { SwapService } from './swap.service';
import { SwapController } from './swap.controller';
import { ConfigModule } from '@nestjs/config'; 

@Module({
  imports: [ConfigModule],
  controllers: [SwapController],
  providers: [SwapService],
  exports: [SwapService],
})
export class SwapModule {}
