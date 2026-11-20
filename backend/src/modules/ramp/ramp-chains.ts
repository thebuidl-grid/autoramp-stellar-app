/**
 * Single source of truth for the chains the ramp supports. DTO validation,
 * Bitnob chain mapping and source-address checks all derive from this, so
 * adding an EVM chain is one entry here (once Bitnob supports it for payouts).
 */
export type RampChainKind = 'evm' | 'stellar';

export interface RampChain {
  /** Network id clients send in `network`. */
  id: string;
  label: string;
  kind: RampChainKind;
  /** Value sent to Bitnob as the payout/withdrawal `chain` (uppercased for payouts). */
  bitnobChain: string;
  onramp: boolean;
  offramp: boolean;
}

export const RAMP_CHAINS: Record<string, RampChain> = {
  base: {
    id: 'base',
    label: 'Base',
    kind: 'evm',
    bitnobChain: 'BASE',
    onramp: true,
    offramp: true,
  },
  bsc: {
    id: 'bsc',
    label: 'BNB Smart Chain',
    kind: 'evm',
    bitnobChain: 'BSC',
    onramp: true,
    offramp: true,
  },
  stellar: {
    id: 'stellar',
    label: 'Stellar',
    kind: 'stellar',
    bitnobChain: 'STELLAR',
    onramp: true,
    offramp: true,
  },
};

const ids = (pick: (c: RampChain) => boolean) =>
  Object.values(RAMP_CHAINS)
    .filter(pick)
    .map((c) => c.id);

export const ONRAMP_NETWORK_IDS = ids((c) => c.onramp);
export const OFFRAMP_NETWORK_IDS = ids((c) => c.offramp);

export function getRampChain(network?: string | null): RampChain | undefined {
  return RAMP_CHAINS[String(network ?? '').toLowerCase()];
}

const ADDRESS_PATTERNS: Record<RampChainKind, RegExp> = {
  evm: /^0x[a-fA-F0-9]{40}$/,
  stellar: /^G[A-Z2-7]{55}$/,
};

export function isValidAddressForChain(
  chain: RampChain,
  address: string,
): boolean {
  return ADDRESS_PATTERNS[chain.kind].test(address);
}

export function addressLabel(chain: RampChain): string {
  return chain.kind === 'stellar' ? 'Stellar public key' : 'wallet address';
}
