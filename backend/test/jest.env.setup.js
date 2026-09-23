// Runs before any test file (and therefore before AppModule/ConfigModule.forRoot
// is ever imported) — required because Nest's ConfigModule.forRoot Joi
// validation executes as a module-decorator side effect at import time, not
// lazily, so these must exist before the first `import { AppModule }`.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused:unused@localhost:5432/unused';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-resend-key';
process.env.MONIE_RATE_API_KEY = process.env.MONIE_RATE_API_KEY || 'test-monierate-key';
process.env.STABLESTACK_API_URL = process.env.STABLESTACK_API_URL || 'https://flint.example.com';
process.env.STABLESTACK_API_KEY = process.env.STABLESTACK_API_KEY || 'test-flint-key';
// Most e2e suites assume Flint is the active ramp processor (it's the
// easiest to mock via a plain HttpService stub — see test-app.ts's corridor
// seed comment) and don't set this themselves. Without a default here, the
// developer's real backend/.env (RAMP_PROCESSOR_PROVIDER=safehaven) leaks
// in via ConfigModule.forRoot and silently breaks every Flint-assuming
// suite. A suite that needs a different provider (e.g. safehaven.e2e-spec.ts)
// still overrides this in its own beforeAll before calling createTestApp.
process.env.RAMP_PROCESSOR_PROVIDER = process.env.RAMP_PROCESSOR_PROVIDER || 'flint';
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_paystack_key';
process.env.PAYSTACK_DVA_PREFERRED_BANK_GHS = process.env.PAYSTACK_DVA_PREFERRED_BANK_GHS || 'test-ghs-bank';
// Throwaway RSA keypair, test-only — SafeHavenRampProcessor signs a client
// assertion JWT with this at construction time. HttpService is mocked in
// e2e tests, so it's never actually sent anywhere or validated.
process.env.SAFEHAVEN_CLIENT_ID = process.env.SAFEHAVEN_CLIENT_ID || 'test-oauth-client-id';
process.env.SAFEHAVEN_CLIENT_ASSERTION_PRIVATE_KEY =
  process.env.SAFEHAVEN_CLIENT_ASSERTION_PRIVATE_KEY ||
  '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDH7VLRMzQpLXd4\nqsDrs/aJu7Y7sJsv655VpIWg8wZoCD8U1krD1hlLSqkxCg8acoH8Pe5na+XZHdJ7\nquf+iQcEkXOzyyJ0FrAyl5gxTAUbwwnvjRA+id75e+4CSZyt4PsvDxcS1Mo/AZdb\nAcLvLeuQ+kzFmA99/kOpqw899WAoCnEjFx66bqxnfijHBJGACoQkFfh1EjZxj/jx\nwd9mpMAaU3usc2lceRArDFrkKUWdzJLlRZYNoGggdLS4q2+xHAkOCNItNkJnt4LX\nujmtIoRE4M7GZdWnu7LCUJOp4cwU4aeyTJEDBIy3nc2E4Tw+5iz9hJi/WLrSYIXh\nwPfDtJPxAgMBAAECggEAB8jctoBHvH9kjVfEvvNucEAqtoSdaPkZMgd/xoZqo5wH\n7MVH+vvNV1UBuoLu7J40eSsQ1d5p1ZGSM7YyEK4AOR7QF6+bWKmA1ITPlxfOg8gN\nN9J7z/DpXuMtn3wt9B1Jr97mt0PULi40g7AmtCPLGNrjfgwk353fakNatWm7rpi2\ng+QxjbW7W6kWlH4JFNWKp6gsm4V0PI/nwWNXQDSsC0L6sOuCuWTYGrjYR4F5D7QY\nDdYiDDqeppPAaiJfHRBNL+fWauCdnuNodKyqtIx7hP10PsLNurrLa7t/qyq/2gjs\nSmuM4qfeKxwOEWyuqOmg3oRBINpfF9e0V4/EvQdD4wKBgQDuI4TX5iLKT38Oh+cH\nmxcHrETj6BNEysbTQ0OIJNL7hX4VqQnp7y5qxSKbCwq9cciGjHDvJ/xk7E+xiryU\nR8Vl0foq5TGoxwe5Izvf7JVJkI+bUeMQPEAXQ7WE1WyJa5SfZQc2SdssX+fJfPy4\nqHEOddJ5YW3Ii/S3J7BRrMO4YwKBgQDW7Brmv8ThCNHze0MrATIR/eldWMXrac9z\nxJ8DuCNNkzWcMj3G9vUOeghHrgGqnTplVnziLuyjurvT49WvccHSNriYuuXV4tyQ\nITppnVIM5PEN2NNyN7+tGRcDZL5CEHge47vErIvKjORDHhJaD/unUY+MOFTKF5eL\nlgW3nadQmwKBgCPYkuGQ0cHUT5LXYC5j6QaNpt0LjQL45w7b/CldKakUwhLunABr\nsXf+7qOZ+OblXsLqFwHY6gQjEifuc056szsNbXPRhjUaqI30wMmHKj2llghSPjSu\nbRNTbNpu6eSRnhCUO46vdV9rnE9XEg+Vw1bi42jEAquCbba4MbFJqThzAoGAfAK6\nNwDaIhrLwhkSlaLX+EexOrp5YS+pkxwVwLikLiPN4DWhLcfbeKHzWyDNN1wHkOeJ\noZz/0C10KXwiFVynQJtwgjf9XB/NsqBpqv0qleQYLyw4PYRrZf6/J6cenNIR7Yjs\nFDyXYKVRJGUao7rrMw09rePnEMDyIYnL/LnMDBcCgYBf3IwagcpmxEKUUwo1YEyS\nFMRGVnzGI6y+z5+5SrluNnmqoLg52YZ521dLbljlaUCOiWpuOGNkr+yf+1E6yvcV\n+w1G19TOKMezjziEeG0dCUoGWlrohiN8Up6MZVxaoMmHF6LaEYqbDHITQa12gpHj\n1eZE832pssdiDo25FV9pgQ==\n-----END PRIVATE KEY-----\n';
process.env.SAFEHAVEN_COMPANY_URL = process.env.SAFEHAVEN_COMPANY_URL || 'https://autoramp.example.com';
process.env.SAFEHAVEN_DEBIT_ACCOUNT_NUMBER = process.env.SAFEHAVEN_DEBIT_ACCOUNT_NUMBER || '0011122233';
process.env.SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER = process.env.SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER || '0099988877';
process.env.STELLAR_DISTRIBUTION_PUBLIC_KEY =
  process.env.STELLAR_DISTRIBUTION_PUBLIC_KEY || 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
process.env.CNGN_ISSUER_PUBLIC_KEY =
  process.env.CNGN_ISSUER_PUBLIC_KEY || 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
process.env.USDC_ISSUER_PUBLIC_KEY =
  process.env.USDC_ISSUER_PUBLIC_KEY || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
// ZeroXSwapQuoteService (multi-stablecoin bridge-in) — HttpService is mocked
// in e2e tests, so this never actually calls 0x; just needs to be present so
// the config check upstream of that mocked call doesn't 400 first.
process.env.ZEROX_API_KEY = process.env.ZEROX_API_KEY || 'test-0x-api-key';
