import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { OtpService } from './services/otp.service';
import { DatabaseModule } from '../../database/database.module';

/**
 * Auth Module
 *
 * Provides authentication functionality including:
 * - User sign up and sign in
 * - Admin login
 * - JWT token generation and validation
 * - Authentication guards
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not defined in environment variables');
        }
        return {
          secret,
          signOptions: { expiresIn: '24h' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, JwtStrategy, JwtAuthGuard, AdminGuard],
  exports: [AuthService, OtpService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
