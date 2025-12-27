import { plainToClass } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('Swapper API Service'),

  // Database
  DB_HOST: Joi.string().hostname().optional().allow('', null),
  DB_PORT: Joi.number().default(5432).optional().allow('', null),
  DB_USERNAME: Joi.string().optional().allow('', null),
  DB_PASSWORD: Joi.string().optional().allow('', null),
  DB_DATABASE: Joi.string().optional().allow('', null),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('24h').optional().allow('', null),
  
  // Database
  DATABASE_URL: Joi.string().required(),

  // BLOCKCHAIN
  RPC_URL: Joi.string().optional().allow('', null),

  // STABLESTACK
  STABLESTACK_API_URL: Joi.string().uri().optional().allow('', null),
  STABLESTACK_API_KEY: Joi.string().optional().allow('', null),

  // RESEND
  RESEND_API_KEY: Joi.string().required(),
  RESEND_FROM_EMAIL: Joi.string().email().optional().allow('', null),

  // WEBHOOK
  WEBHOOK_URL: Joi.string().uri().optional().allow('', null),

  // FRONTEND
  FRONTEND_URL: Joi.string().uri().optional().allow('', null),

  // MONIE RATE API
  MONIE_RATE_API_KEY: Joi.string().required(),
});

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  APP_NAME: string;

  @IsString()
  @IsOptional()
  DB_HOST: string;

  @IsInt()
  @IsOptional()
  DB_PORT: number = 5432;

  @IsString()
  @IsOptional()
  DB_USERNAME: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD: string;

  @IsString()
  @IsOptional()
  DB_DATABASE: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '24h';
  
  @IsString()
  DATABASE_URL: string;

  @IsString()
  @IsOptional()
  RPC_URL: string;

  @IsString()
  @IsOptional()
  STABLESTACK_API_URL: string;

  @IsString()
  @IsOptional()
  STABLESTACK_API_KEY: string;

  @IsString()
  RESEND_API_KEY: string;

  @IsString()
  @IsOptional()
  RESEND_FROM_EMAIL: string;

  @IsString()
  @IsOptional()
  WEBHOOK_URL: string;

  @IsString()
  @IsOptional()
  FRONTEND_URL: string;

  @IsString()
  MONIE_RATE_API_KEY: string;
}

export const validate = (config: Record<string, any>) => {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    excludeExtraneousValues: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
};
