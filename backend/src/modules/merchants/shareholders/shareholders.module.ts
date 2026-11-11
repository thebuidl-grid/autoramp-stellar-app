import { Module } from '@nestjs/common';
import { ShareholdersService } from './shareholders.service';
import { ShareholdersController } from './shareholders.controller';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ShareholdersController],
  providers: [ShareholdersService],
  exports: [ShareholdersService],
})
export class ShareholdersModule {}
