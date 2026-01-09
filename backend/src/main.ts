import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new LoggingInterceptor());

  // CORS Configuration
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const allowedOrigins = [
    frontendUrl,
    'http://localhost:3001',
    'http://localhost:3000',
  ].filter(Boolean); // Remove undefined/null values

  console.log('CORS allowed origins:', allowedOrigins);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // For development, allow localhost with any port
      if (
        process.env.NODE_ENV === 'development' &&
        origin.startsWith('http://localhost:')
      ) {
        return callback(null, true);
      }

      // Reject other origins
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    exposedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('CNGN Ramp API Service')
    .setDescription(
      'API for onramp/offramp transactions, token swaps, and user management',
    )
    .setVersion('1.0')
    .addTag('Authentication', 'User and admin authentication endpoints')
    .addTag('User', 'User profile management')
    .addTag('Admin', 'Admin-only endpoints for user and transaction management')
    .addTag('Swap', 'Token swap operations')
    .addTag('Stablestack', 'Onramp and offramp transaction endpoints')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'Enter your API key (format: sk_live_...)',
      },
      'API-Key', // Name for API key auth
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3001);
  console.log('API server running on http://localhost:3000');
  console.log('Swagger docs: http://localhost:3000/api');
}
bootstrap();
