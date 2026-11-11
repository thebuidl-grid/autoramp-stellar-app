import { Module } from '@nestjs/common';
import { DocumentationsService } from './documentations.service';
import { DocumentationsController } from './documentations.controller';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [DocumentationsController],
  providers: [DocumentationsService],
  exports: [DocumentationsService],
})
export class DocumentationsModule {}
