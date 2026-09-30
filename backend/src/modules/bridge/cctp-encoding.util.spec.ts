import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { buildCctpForwarderHookData, hexToBuffer, stellarContractToBytes32 } from './cctp-encoding.util';

describe('buildCctpForwarderHookData', () => {
  it('encodes a G... account address per the CctpForwarder layout', () => {
    const address = Keypair.random().publicKey();
    const hex = buildCctpForwarderHookData(address);
    expect(hex.startsWith('0x')).toBe(true);

    const buffer = Buffer.from(hex.slice(2), 'hex');
    const version = buffer.readUInt32BE(24);
    const length = buffer.readUInt32BE(28);
    const recipient = buffer.subarray(32, 32 + length).toString('utf8');

    expect(version).toBe(0);
    expect(length).toBe(address.length);
    expect(recipient).toBe(address);
    expect(buffer.length).toBe(32 + address.length);
    // First 24 bytes are reserved/zeroed
    expect(buffer.subarray(0, 24).every((byte) => byte === 0)).toBe(true);
  });

  it('accepts a C... contract address', () => {
    const contractId = 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ';
    const hex = buildCctpForwarderHookData(contractId);
    const buffer = Buffer.from(hex.slice(2), 'hex');
    const length = buffer.readUInt32BE(28);
    expect(buffer.subarray(32, 32 + length).toString('utf8')).toBe(contractId);
  });

  it('rejects an invalid strkey', () => {
    expect(() => buildCctpForwarderHookData('not-a-real-address')).toThrow(
      'Invalid Stellar recipient for CCTP hook data',
    );
  });
});

describe('hexToBuffer', () => {
  it('strips an optional 0x prefix', () => {
    expect(hexToBuffer('0xdeadbeef')).toEqual(Buffer.from('deadbeef', 'hex'));
    expect(hexToBuffer('deadbeef')).toEqual(Buffer.from('deadbeef', 'hex'));
  });
});

describe('stellarContractToBytes32', () => {
  it('recovers the raw 32-byte contract id, not the strkey text', () => {
    const contractId = 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ';
    const result = stellarContractToBytes32(contractId);

    expect(result.startsWith('0x')).toBe(true);
    const raw = Buffer.from(result.slice(2), 'hex');
    expect(raw).toHaveLength(32); // a bytes32 ABI field must be exactly 32 bytes
    // Round-trips back to the original strkey — confirms this is the real
    // contract id, not a truncated/garbage decode of the strkey text itself
    // (the bug this guards against: casting the strkey string as hex).
    expect(StrKey.encodeContract(raw)).toBe(contractId);
  });

  it('rejects a non-contract strkey', () => {
    const accountAddress = Keypair.random().publicKey(); // G..., not C...
    expect(() => stellarContractToBytes32(accountAddress)).toThrow();
  });
});
