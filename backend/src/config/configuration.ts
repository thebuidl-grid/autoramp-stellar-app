import { ConfigFactory } from '@nestjs/config';
import { validationSchema } from './env.validation';

export const configFactory: ConfigFactory = () => {
  const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    appName: process.env.APP_NAME,
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT,
    dbUser: process.env.DB_USERNAME,
    dbPass: process.env.DB_PASSWORD,
    dbName: process.env.DB_DATABASE,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: process.env.RPC_URL,
    rampApiUrl: process.env.RAMP_API_URL || process.env.STABLESTACK_API_URL,
    rampApiKey: process.env.RAMP_API_KEY || process.env.STABLESTACK_API_KEY,
    safehavenBaseUrl: process.env.SAFEHAVEN_BASE_URL,
    safehavenClientId: process.env.SAFEHAVEN_CLIENT_ID,
    safehavenIbsClientId: process.env.SAFEHAVEN_IBS_CLIENT_ID,
    safehavenDebitAccountNumber: process.env.SAFEHAVEN_DEBIT_ACCOUNT_NUMBER,
    safehavenBankCode: process.env.SAFEHAVEN_BANK_CODE,

    // Pulse MFB
    pulseMfbBaseUrl: process.env.PULSE_MFB_BASE_URL,
    pulseMfbPublicKey: process.env.PULSE_MFB_PUBLIC_KEY,
    pulseMfbPrivateKey: process.env.PULSE_MFB_PRIVATE_KEY,
    pulseMfbWebhookSecret: process.env.PULSE_MFB_WEBHOOK_SECRET,

    // Fiat provider config (safehaven | pulse_mfb)
    fiatTransferProvider: process.env.FIAT_TRANSFER_PROVIDER || 'PULSE_MFB',
  };

  const { error } = validationSchema.validate(config, { abortEarly: true });
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }

  return config;
};
