import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryController } from './cloudinary.controller';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [ConfigModule],
  controllers: [CloudinaryController],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
