import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors();

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Swapper API Service')
    .setDescription('API for token swaps and balances on Aerodrome')
    .setVersion('1.0')
    .addTag('Swap')
    .addTag('Stablestack')
    // .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  console.log('API server running on http://localhost:3000');
  console.log('Swagger docs: http://localhost:3000/api');
}
bootstrap();