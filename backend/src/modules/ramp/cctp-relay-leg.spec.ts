import { relayLegFields } from './cctp-relay-leg';

describe('relayLegFields', () => {
  const meta = (relay: any, extra: any = {}) => ({ cctpRelay: relay, ...extra });

  it('is null for an order that does not use the relay', () => {
    expect(relayLegFields('off_1', {})).toBeNull();
    expect(relayLegFields('off_1', null)).toBeNull();
  });

  it('records a fresh order as awaiting its burn, with where the mint will go', () => {
    const f = relayLegFields('off_1', meta({ status: 'awaiting_burn', destinationChain: 'base', mintRecipient: '0xabc', burnAmountUnits: '15000760', maxFeeUnits: '760', network: 'mainnet' }));
    expect(f).toMatchObject({ reference: 'off_1', status: 'AWAITING_BURN', providerReference: null, depositTxHash: null, fundingAddress: '0xabc', failedStep: null });
    expect(f!.details).toMatchObject({ kind: 'offramp_relay', network: 'mainnet', sourceChain: 'stellar', destinationChain: 'base', burnAmountUnits: '15000760', maxFeeUnits: '760' });
  });

  it('takes the burn hash from the order and the mint hash from the relay once it has minted', () => {
    const f = relayLegFields('off_1', meta({ status: 'minted', mintTxHash: '0xmint', mintedAt: '2026-11-19T10:40:27.709Z' }, { stellarTxHash: 'burn123' }));
    expect(f).toMatchObject({ status: 'MINTED', providerReference: 'burn123', depositTxHash: '0xmint' });
    expect(f!.details).toMatchObject({ burnTxHash: 'burn123', mintTxHash: '0xmint', mintedAt: '2026-11-19T10:40:27.709Z' });
  });

  it('marks a rejected relay as failed with the reason', () => {
    const f = relayLegFields('off_1', meta({ status: 'rejected', error: 'Burn does not match this order' }, { stellarTxHash: 'b' }));
    expect(f).toMatchObject({ status: 'REJECTED', failedStep: 'attestation', failureReason: 'Burn does not match this order' });
  });

  it('defaults a relay with no status to awaiting its burn', () => {
    expect(relayLegFields('off_1', meta({ mintRecipient: '0x1' }))!.status).toBe('AWAITING_BURN');
  });
});
