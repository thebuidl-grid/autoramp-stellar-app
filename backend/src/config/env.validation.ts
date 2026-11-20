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

  // RAMP (formerly Stablestack)
  RAMP_API_URL: Joi.string().uri().optional().allow('', null),
  RAMP_API_KEY: Joi.string().optional().allow('', null),
  STABLESTACK_API_URL: Joi.string().uri().optional().allow('', null),
  STABLESTACK_API_KEY: Joi.string().optional().allow('', null),

  // RESEND
  RESEND_API_KEY: Joi.string().required(),
  RESEND_FROM_EMAIL: Joi.string().email().optional().allow('', null),

  // WEBHOOK
  FLINT_WEBHOOK_URL: Joi.string().uri().optional().allow('', null),
  SH_WEBHOOK_URL: Joi.string().uri().optional().allow('', null),

  // FRONTEND
  FRONTEND_URL: Joi.string().uri().optional().allow('', null),

  // MONIE RATE API (Deprecated)
  // MONIE_RATE_API_KEY: Joi.string().required(),

  // SAFEHAVEN
  SAFEHAVEN_BASE_URL: Joi.string().uri().required(),
  SAFEHAVEN_CLIENT_ID: Joi.string().required(),
  SAFEHAVEN_IBS_CLIENT_ID: Joi.string().required(),
  SAFEHAVEN_DEBIT_ACCOUNT_NUMBER: Joi.string().required(),
  SAFEHAVEN_BANK_CODE: Joi.string().required(),

  // PULSE MFB
  PULSE_MFB_BASE_URL: Joi.string().uri().optional().allow('', null),
  PULSE_MFB_PUBLIC_KEY: Joi.string().optional().allow('', null),
  PULSE_MFB_PRIVATE_KEY: Joi.string().optional().allow('', null),
  PULSE_MFB_WEBHOOK_SECRET: Joi.string().optional().allow('', null),

  // Fiat provider selection
  // NGN user on/off-ramps settle through SafeHaven virtual accounts. ON by default; set 'false' to use Bitnob directly.
  SAFEHAVEN_NGN_SETTLEMENT: Joi.string().valid('true', 'false').optional(),
  FIAT_TRANSFER_PROVIDER: Joi.string()
    .valid('SAFEHAVEN', 'PULSE_MFB')
    .default('PULSE_MFB'),

  // Cloudinary
  CL_NAME: Joi.string().optional().allow('', null),
  CL_API_KEY: Joi.string().optional().allow('', null),
  CL_API_SECRET: Joi.string().optional().allow('', null),
  CL_PRESET_NAME: Joi.string().optional().allow('', null),

  // Bitnob (primary Stellar USDC onramp + offramp provider, sandbox-first)
  BITNOB_API_URL: Joi.string()
    .uri()
    .default('https://api.bitnob.com')
    .optional()
    .allow('', null),
  // From the Bitnob dashboard (app.bitnob.com) — also called Client ID
  BITNOB_CLIENT_ID: Joi.string().optional().allow('', null),
  // HMAC signing secret ("API Key"/secret_...). BITNOB_KEY is the only variable read.
  BITNOB_KEY: Joi.string().optional().allow('', null),
  // Dashboard webhook signing secret (HMAC-SHA512, x-bitnob-signature)
  BITNOB_WEBHOOK_SECRET: Joi.string().optional().allow('', null),
  // Autoramp's own Bitnob NGN funding account. When set, each NGN on-ramp refills the Bitnob float from SafeHaven.
  BITNOB_FUNDING_ACCOUNT_NUMBER: Joi.string().optional().allow('', null),
  BITNOB_FUNDING_BANK_CODE: Joi.string().optional().allow('', null), // default 000027 (Globus Bank)
  // TEMPORARY: accept Bitnob webhooks even when the signature does not verify. Leave unset/false normally.
  BITNOB_WEBHOOK_SKIP_VERIFY: Joi.string().valid('true', 'false').optional(),
  // Shared tokens for providers whose webhooks are not signed but can send a token (Blockradar,
  // Flint). SafeHaven cannot send one, so its webhook is not token-protected.
  // Callers must send it as `x-webhook-token` or `?token=`. In production an unset token makes
  // the endpoint refuse every request (fail closed). Use a long random value, e.g.
  // `openssl rand -hex 32`.
  BLOCKRADAR_WEBHOOK_TOKEN: Joi.string().min(16).optional().allow('', null),
  FLINT_WEBHOOK_TOKEN: Joi.string().min(16).optional().allow('', null),
  // Explicit, temporary rollout escape hatch: accept unauthenticated provider webhooks.
  WEBHOOK_ALLOW_UNAUTHENTICATED: Joi.string().valid('true', 'false').optional(),
  // Per-payout callback_url (optional; dashboard webhooks still fire)
  BITNOB_WEBHOOK_URL: Joi.string().uri().optional().allow('', null),
  // Sandbox-only: synthesize BVN/DOB/phone for customers (never enable in prod)
  BITNOB_SYNTHETIC_KYC: Joi.string()
    .valid('true', 'false')
    .default('true')
    .optional()
    .allow('', null),

  // CCTP / Bridge Kit (cross-chain USDC bridging: source -> destination)
  CCTP_BRIDGE_PRIVATE_KEY: Joi.string().optional().allow('', null),
  CCTP_SOURCE_CHAIN: Joi.string().optional().allow('', null),
  CCTP_DESTINATION_CHAIN: Joi.string().optional().allow('', null),
  CCTP_SOURCE_RPC_URL: Joi.string().uri().optional().allow('', null),
  CCTP_DESTINATION_RPC_URL: Joi.string().uri().optional().allow('', null),
  STELLAR_RELAYER_SECRET: Joi.string().optional().allow('', null),
  // Stellar off-ramp over CCTP + Base: relayer wallet (pays Base gas for the mint). Relay is on when a key is set,
  // unless STELLAR_OFFRAMP_RELAY=false. BASE_RELAYER_RPC_URL falls back to CCTP_DESTINATION_RPC_URL, then a public RPC.
  BASE_RELAYER_PRIVATE_KEY: Joi.string().optional().allow('', null),
  BASE_RELAYER_RPC_URL: Joi.string().uri().optional().allow('', null),
  STELLAR_OFFRAMP_RELAY: Joi.string().valid('true', 'false').optional(),
  // Network for the Stellar off-ramp relay. Defaults to mainnet (not CCTP_NETWORK, which defaults to testnet).
  STELLAR_OFFRAMP_NETWORK: Joi.string().valid('mainnet', 'testnet').optional().allow('', null),
  STELLAR_SOROBAN_RPC_URL: Joi.string().uri().optional().allow('', null),
  CCTP_NETWORK: Joi.string()
    .valid('mainnet', 'testnet')
    .default('testnet')
    .optional()
    .allow('', null),
  CCTP_BRIDGE_SPEED: Joi.string()
    .valid('FAST', 'SLOW')
    .default('FAST')
    .optional()
    .allow('', null),
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
  RAMP_API_URL: string;

  @IsString()
  @IsOptional()
  RAMP_API_KEY: string;

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
  FLINT_WEBHOOK_URL: string;

  @IsString()
  @IsOptional()
  SH_WEBHOOK_URL: string;

  @IsString()
  @IsOptional()
  FRONTEND_URL: string;

  @IsString()
  // MONIE_RATE_API_KEY: string;
  @IsString()
  SAFEHAVEN_BASE_URL: string;

  @IsString()
  SAFEHAVEN_CLIENT_ID: string;

  @IsString()
  SAFEHAVEN_IBS_CLIENT_ID: string;

  @IsString()
  SAFEHAVEN_DEBIT_ACCOUNT_NUMBER: string;

  @IsString()
  SAFEHAVEN_BANK_CODE: string;

  @IsString()
  @IsOptional()
  PULSE_MFB_BASE_URL: string;

  @IsString()
  @IsOptional()
  PULSE_MFB_PUBLIC_KEY: string;

  @IsString()
  @IsOptional()
  PULSE_MFB_PRIVATE_KEY: string;

  @IsString()
  @IsOptional()
  PULSE_MFB_WEBHOOK_SECRET: string;

  @IsString()
  @IsOptional()
  FIAT_TRANSFER_PROVIDER: string;

  @IsString()
  @IsOptional()
  CL_NAME: string;

  @IsString()
  @IsOptional()
  CL_API_KEY: string;

  @IsString()
  @IsOptional()
  CL_API_SECRET: string;

  @IsString()
  @IsOptional()
  CL_PRESET_NAME: string;

  @IsString()
  @IsOptional()
  BITNOB_API_URL: string;

  @IsString()
  @IsOptional()
  BITNOB_CLIENT_ID: string;

  @IsString()
  @IsOptional()
  BITNOB_KEY: string;

  @IsString()
  @IsOptional()
  BITNOB_WEBHOOK_SECRET: string;
  BITNOB_WEBHOOK_SKIP_VERIFY: string;

  @IsString()
  @IsOptional()
  BLOCKRADAR_WEBHOOK_TOKEN: string;

  @IsString()
  @IsOptional()
  FLINT_WEBHOOK_TOKEN: string;

  @IsString()
  @IsOptional()
  WEBHOOK_ALLOW_UNAUTHENTICATED: string;

  @IsString()
  @IsOptional()
  BITNOB_WEBHOOK_URL: string;

  @IsString()
  @IsOptional()
  BITNOB_SYNTHETIC_KYC: string;

  @IsString()
  @IsOptional()
  CCTP_BRIDGE_PRIVATE_KEY: string;

  @IsString()
  @IsOptional()
  STELLAR_RELAYER_SECRET: string;

  @IsString()
  @IsOptional()
  STELLAR_SOROBAN_RPC_URL: string;

  @IsString()
  @IsOptional()
  CCTP_SOURCE_CHAIN: string;

  @IsString()
  @IsOptional()
  CCTP_DESTINATION_CHAIN: string;

  @IsString()
  @IsOptional()
  CCTP_SOURCE_RPC_URL: string;

  @IsString()
  @IsOptional()
  CCTP_DESTINATION_RPC_URL: string;

  @IsString()
  @IsOptional()
  CCTP_NETWORK: string;

  @IsString()
  @IsOptional()
  CCTP_BRIDGE_SPEED: string;
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
