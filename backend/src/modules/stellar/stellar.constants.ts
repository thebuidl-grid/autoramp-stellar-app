import { Networks } from '@stellar/stellar-sdk';

export type StellarNetwork = 'testnet' | 'mainnet';

export const STELLAR_NETWORK: StellarNetwork =
  (process.env.STELLAR_NETWORK as StellarNetwork) || 'testnet';

export const STELLAR_CONFIG = {
  network: STELLAR_NETWORK,
  horizonUrl:
    process.env.STELLAR_HORIZON_URL ||
    (STELLAR_NETWORK === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org'),
  networkPassphrase:
    process.env.STELLAR_NETWORK_PASSPHRASE ||
    (STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET),
};

// Stellar text memos are capped at 28 bytes. generateTrxReference() produces
// "txn_ref_" + 16 chars = 24 chars, which fits.
export const MEMO_MAX_BYTES = 28;
