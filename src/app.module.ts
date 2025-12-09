import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/env.validation';
import { ApiModule } from './modules/api/api.module';
import { SwapModule } from './modules/swap/swap.module';
import { StablestackModule } from './modules/stablestack/stablestack.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema,
    }),
    ApiModule,
    SwapModule,
    StablestackModule,
  ],
})
export class AppModule {}
