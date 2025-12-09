export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  appName: string;
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  jwt: { secret: string; expiresIn: string };
  wallet_private_key: string;
  rpc_url: string;
  stablestack: { api_url: string; api_key: string };
}
