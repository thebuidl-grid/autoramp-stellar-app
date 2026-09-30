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

  // Dev-only: return the OTP in the /auth/otp/send response when email
  // delivery fails. Ignored when NODE_ENV=production — see OtpService.
  OTP_DEV_RETURN_CODE: Joi.string().valid('true', 'false').optional().allow('', null),

  // Database
  DATABASE_URL: Joi.string().required(),

  // STELLAR
  STELLAR_NETWORK: Joi.string().valid('testnet', 'mainnet').default('testnet'),
  STELLAR_HORIZON_URL: Joi.string().uri().optional().allow('', null),
  STELLAR_NETWORK_PASSPHRASE: Joi.string().optional().allow('', null),
  STELLAR_ISSUER_SECRET: Joi.string().optional().allow('', null),
  STELLAR_DISTRIBUTION_SECRET: Joi.string().optional().allow('', null),
  STELLAR_DISTRIBUTION_PUBLIC_KEY: Joi.string().optional().allow('', null),
  CNGN_ISSUER_PUBLIC_KEY: Joi.string().optional().allow('', null),
  USDC_ISSUER_PUBLIC_KEY: Joi.string().optional().allow('', null),
  // Circle's real USDC issuer (classic Stellar asset) — deliberately separate
  // from USDC_ISSUER_PUBLIC_KEY, which is AutoRamp's own self-issued stand-in
  // for the NGN on/offramp corridor. This one powers the XLM<->USDC swap
  // route specifically, so users can get real, bridge-compatible USDC. See
  // modules/swap/config/constant.ts's getBridgeUsdcAsset().
  BRIDGE_USDC_ISSUER_PUBLIC_KEY: Joi.string().optional().allow('', null),

  // CCTP BRIDGE INFRA (any registered chain <-> any registered chain, see modules/bridge)
  STELLAR_SOROBAN_RPC_URL: Joi.string().uri().optional().allow('', null),
  // Deliberately separate from STELLAR_DISTRIBUTION_SECRET — this is new,
  // less-proven Soroban-invocation code, and a bug here shouldn't be able
  // to touch the funds backing fiat corridor payouts.
  STELLAR_BRIDGE_RELAYER_SECRET: Joi.string().optional().allow('', null),
  CIRCLE_IRIS_API_URL: Joi.string().uri().optional().allow('', null),
  // EVM-side relayer wallets — one pair per EVM chain in the registry.
  // Separate keys per chain (not one shared key) so a compromised/misused
  // key on one chain can't be replayed against another, and so gas
  // balances can be funded/monitored independently. Each relayer wallet
  // needs native gas on its chain to fund ephemeral collection addresses
  // and to submit MessageTransmitterV2.receiveMessage mints.
  BASE_RPC_URL: Joi.string().uri().optional().allow('', null),
  BASE_RELAYER_PRIVATE_KEY: Joi.string().optional().allow('', null),
  ETHEREUM_RPC_URL: Joi.string().uri().optional().allow('', null),
  ETHEREUM_RELAYER_PRIVATE_KEY: Joi.string().optional().allow('', null),
  ARBITRUM_RPC_URL: Joi.string().uri().optional().allow('', null),
  ARBITRUM_RELAYER_PRIVATE_KEY: Joi.string().optional().allow('', null),
  OPTIMISM_RPC_URL: Joi.string().uri().optional().allow('', null),
  OPTIMISM_RELAYER_PRIVATE_KEY: Joi.string().optional().allow('', null),
  POLYGON_RPC_URL: Joi.string().uri().optional().allow('', null),
  POLYGON_RELAYER_PRIVATE_KEY: Joi.string().optional().allow('', null),
  AVALANCHE_RPC_URL: Joi.string().uri().optional().allow('', null),
  AVALANCHE_RELAYER_PRIVATE_KEY: Joi.string().optional().allow('', null),
  // Multi-stablecoin bridge-in (Swap tab): prices/builds the source-chain
  // swap-to-USDC step for a non-USDC sourceTokenCode (USDT, DAI, ...) via
  // 0x's Swap API. See ZeroXSwapQuoteService. Optional — omitting it just
  // means sourceTokenCode requests fail with a clear config error, same as
  // MONIE_RATE_API_KEY's posture for the NGN-rate feature.
  ZEROX_API_KEY: Joi.string().optional().allow('', null),
  // Native gas (in the chain's native unit, e.g. ETH) sent to a freshly
  // generated collection address so it can submit its own approve +
  // depositForBurnWithHook once USDC lands on it.
  EVM_COLLECTION_GAS_FUNDING_AMOUNT: Joi.string().default('0.001'),
  // AES-256-GCM key (32 raw bytes, base64) used to encrypt ephemeral EVM
  // collection private keys at rest — see BridgeService/EvmRelayerService.
  // Never reused for anything else; a leak here only exposes in-flight
  // collection addresses, not distribution/issuer funds.
  EVM_COLLECTION_KEY_ENCRYPTION_SECRET: Joi.string().optional().allow('', null),

  // STABLESTACK (Flint)
  STABLESTACK_API_URL: Joi.string().uri().optional().allow('', null),
  STABLESTACK_API_KEY: Joi.string().optional().allow('', null),
  // Shared secret Flint must present on POST /stablestack/webhook. Unset =
  // every Flint webhook is rejected (fail closed).
  FLINT_WEBHOOK_SECRET: Joi.string().optional().allow('', null),

  // Ramp processor selection — code fallback is 'flint' if unset, but
  // 'safehaven' is the recommended value now that AutoRamp is a signed
  // SafeHaven partner (see .env.example). 'paystack' remains available as
  // the alternative.
  RAMP_PROCESSOR_PROVIDER: Joi.string().valid('flint', 'paystack', 'safehaven').optional().allow('', null),

  // PAYSTACK (alternative ramp processor — Stellar-agnostic by design;
  // also the primary processor for the GH/GHS corridor)
  PAYSTACK_SECRET_KEY: Joi.string().optional().allow('', null),
  PAYSTACK_DVA_PREFERRED_BANK: Joi.string().optional().allow('', null), // legacy name, NGN only
  PAYSTACK_DVA_PREFERRED_BANK_NGN: Joi.string().optional().allow('', null),
  PAYSTACK_DVA_PREFERRED_BANK_GHS: Joi.string().optional().allow('', null),

  // SAFEHAVEN MFB (primary ramp processor — signed partner, licensed institution)
  SAFEHAVEN_BASE_URL: Joi.string().uri().optional().allow('', null),
  SAFEHAVEN_CLIENT_ID: Joi.string().optional().allow('', null),
  SAFEHAVEN_CLIENT_ASSERTION_PRIVATE_KEY: Joi.string().optional().allow('', null),
  SAFEHAVEN_COMPANY_URL: Joi.string().optional().allow('', null),
  SAFEHAVEN_DEBIT_ACCOUNT_NUMBER: Joi.string().optional().allow('', null),
  SAFEHAVEN_SETTLEMENT_BANK_CODE: Joi.string().optional().allow('', null),
  SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER: Joi.string().optional().allow('', null),
  SAFEHAVEN_VIRTUAL_ACCOUNT_VALID_FOR_SECONDS: Joi.number().optional().allow('', null),
  SAFEHAVEN_WEBHOOK_SHARED_SECRET: Joi.string().optional().allow('', null),

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
