import {
  CCTP_DOMAIN_BASE,
  CCTP_DOMAIN_STELLAR,
  decimalToUnits,
  isStellarOfframpRelayEnabled,
  parseCctpV2BurnMessage,
  planStellarBurn,
  unitsToDecimal,
} from './cctp-stellar-relay.util';

const cfg = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as any;

describe('cctp-stellar-relay.util', () => {
  describe('isStellarOfframpRelayEnabled', () => {
    it('needs a relayer key, and can be switched off', () => {
      expect(isStellarOfframpRelayEnabled(cfg({}))).toBe(false);
      expect(
        isStellarOfframpRelayEnabled(
          cfg({ BASE_RELAYER_PRIVATE_KEY: '0xabc' }),
        ),
      ).toBe(true);
      expect(
        isStellarOfframpRelayEnabled(
          cfg({
            BASE_RELAYER_PRIVATE_KEY: '0xabc',
            STELLAR_OFFRAMP_RELAY: 'false',
          }),
        ),
      ).toBe(false);
    });
  });

  describe('decimal helpers', () => {
    it('converts to and from 7 dp units', () => {
      expect(decimalToUnits('12.3456789')).toBe(123456789n);
      expect(decimalToUnits('5')).toBe(50000000n);
      expect(unitsToDecimal(123456789n)).toBe('12.3456789');
      expect(unitsToDecimal(1n)).toBe('0.0000001');
    });
    it('rounds extra precision up and rejects garbage', () => {
      expect(decimalToUnits('1.00000001')).toBe(10000001n);
      expect(() => decimalToUnits('-1')).toThrow();
      expect(() => decimalToUnits('abc')).toThrow();
    });
  });

  describe('planStellarBurn', () => {
    it('burns a whole 6-dp amount that is never below what Bitnob must receive', () => {
      for (const [pay, bps] of [
        ['1.372977', 0],
        ['100', 0],
        ['2500.123456', 1.3],
        ['0.5', 10],
      ] as const) {
        const p = planStellarBurn(pay, bps);
        const burn = BigInt(p.burnAmountUnits);
        const maxFee = BigInt(p.maxFeeUnits);
        const target = decimalToUnits(pay);
        expect(burn % 10n).toBe(0n);
        expect(burn - maxFee).toBe(target);
        // worst case: the fee is charged at the planned rate (ceil on the burn)
        const worstFee =
          (burn * BigInt(Math.ceil((bps + 0) * 1000)) + 9_999_999n) /
          10_000_000n;
        expect(burn - worstFee).toBeGreaterThanOrEqual(target);
      }
    });
    it('adds only a small cushion when Circle quotes a zero fee', () => {
      const p = planStellarBurn('100', 0);
      const over = Number(p.maxFee);
      expect(over).toBeGreaterThan(0);
      expect(over).toBeLessThan(0.01); // < 1 cent on $100
    });
    it('rejects non-positive amounts', () => {
      expect(() => planStellarBurn('0', 0)).toThrow();
    });
  });

  describe('parseCctpV2BurnMessage', () => {
    const build = (
      over: Partial<{
        src: number;
        dst: number;
        recipient: string;
        amount: bigint;
        fee: bigint;
      }> = {},
    ) => {
      const header = Buffer.alloc(148);
      header.writeUInt32BE(1, 0);
      header.writeUInt32BE(over.src ?? CCTP_DOMAIN_STELLAR, 4);
      header.writeUInt32BE(over.dst ?? CCTP_DOMAIN_BASE, 8);
      Buffer.from('ab'.repeat(32), 'hex').copy(header, 12);
      const body = Buffer.alloc(228);
      Buffer.from(
        (over.recipient ?? '0x' + '11'.repeat(20)).slice(2),
        'hex',
      ).copy(body, 36 + 12);
      Buffer.from(
        (over.amount ?? 1_372_977n).toString(16).padStart(64, '0'),
        'hex',
      ).copy(body, 68);
      Buffer.from((over.fee ?? 0n).toString(16).padStart(64, '0'), 'hex').copy(
        body,
        164,
      );
      return '0x' + Buffer.concat([header, body]).toString('hex');
    };

    it('reads domains, nonce, recipient and amounts', () => {
      const m = parseCctpV2BurnMessage(
        build({
          recipient: '0x' + 'Ab'.repeat(20),
          amount: 5_000_000n,
          fee: 25n,
        }),
      );
      expect(m.sourceDomain).toBe(27);
      expect(m.destinationDomain).toBe(6);
      expect(m.nonce).toBe('0x' + 'ab'.repeat(32));
      expect(m.mintRecipient).toBe('0x' + 'ab'.repeat(20));
      expect(m.amount).toBe(5_000_000n);
      expect(m.feeExecuted).toBe(25n);
    });
    it('rejects malformed or short messages', () => {
      expect(() => parseCctpV2BurnMessage('0x1234')).toThrow('too short');
      expect(() => parseCctpV2BurnMessage('zz')).toThrow('Malformed');
    });
  });
});
