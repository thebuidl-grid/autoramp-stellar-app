import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  // rawBody is required for HMAC verification of Bitnob webhooks
  // (signature is computed over the exact bytes, not the parsed JSON)
  const app = await NestFactory.create(AppModule, { rawBody: true });
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
    'https://www.useautoramp.com',
    'http://localhost:3001',
    'http://localhost:3000',
    'http://localhost:3002',
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
    exposedHeaders: [
      'Content-Type',
      'Authorization',
      // Rate-limit headers set by CustomThrottlerGuard
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'RateLimit-Policy',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  });

  const port = configService.get<number>('PORT') || 3000;

  // Swagger setup
  if (configService.get('NODE_ENV') === 'development') {
    const config = new DocumentBuilder()
      .setTitle('CNGN Ramp API Service')
      .setDescription(
        'API for onramp/offramp transactions, token swaps, and user management',
      )
      .setVersion('1.0')
      .addTag('Authentication', 'User and admin authentication endpoints')
      .addTag('User', 'User profile management')
      .addTag(
        'Admin',
        'Admin-only endpoints for user and transaction management',
      )
      .addTag('Swap', 'Token swap operations')
      .addTag('Ramp', 'Onramp and offramp transaction endpoints')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'x-api-key',
          in: 'header',
          description: 'Enter your API key (format: sk_live_...)',
        },
        'API-Key',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    console.log(`Swagger docs: http://localhost:${port}/docs`);
  }

  await app.listen(port);
  console.log(`API server running on http://localhost:${port}`);
}
bootstrap();
