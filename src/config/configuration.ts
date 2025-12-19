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
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
    rpcUrl: process.env.RPC_URL,
    stablestackApiUrl: process.env.STABLESTACK_API_URL,
    stablestackApiKey: process.env.STABLESTACK_API_KEY,
  };

  const { error } = validationSchema.validate(config, { abortEarly: true });
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }

  return config;
};
