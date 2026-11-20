import {
  OFFRAMP_NETWORK_IDS,
  ONRAMP_NETWORK_IDS,
  addressLabel,
  getRampChain,
  isValidAddressForChain,
} from './ramp-chains';

describe('ramp-chains', () => {
  it('exposes the supported networks for both directions', () => {
    expect(OFFRAMP_NETWORK_IDS).toEqual(['base', 'bsc', 'stellar']);
    expect(ONRAMP_NETWORK_IDS).toEqual(['base', 'bsc', 'stellar']);
  });

  it('maps a network to its Bitnob chain, case-insensitively', () => {
    expect(getRampChain('BSC')?.bitnobChain).toBe('BSC');
    expect(getRampChain('stellar')?.bitnobChain).toBe('STELLAR');
    expect(getRampChain('solana')).toBeUndefined();
  });

  it('validates addresses by chain kind', () => {
    const evm = getRampChain('base')!;
    const xlm = getRampChain('stellar')!;
    const evmAddr = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
    const xlmAddr = 'G' + 'A'.repeat(55);
    expect(isValidAddressForChain(evm, evmAddr)).toBe(true);
    expect(isValidAddressForChain(evm, xlmAddr)).toBe(false);
    expect(isValidAddressForChain(xlm, xlmAddr)).toBe(true);
    expect(isValidAddressForChain(xlm, evmAddr)).toBe(false);
    expect(addressLabel(xlm)).toBe('Stellar public key');
    expect(addressLabel(evm)).toBe('wallet address');
  });
});
