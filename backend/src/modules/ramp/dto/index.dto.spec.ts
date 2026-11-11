import { validate } from 'class-validator';
import {
  ConfirmStellarOfframpDto,
  onRampDto,
  offRampDto,
} from './index.dto';
import { plainToInstance } from 'class-transformer';

const VALID_STELLAR_ADDRESS = `G${'A'.repeat(55)}`;
const VALID_STELLAR_TX_HASH = 'a'.repeat(64);

describe('Ramp DTOs Transaction Limits', () => {
  describe('onRampDto', () => {
    it('should fail if amount is less than 2000', async () => {
      const dto = plainToInstance(onRampDto, {
        network: 'base',
        amount: 1000,
        destination: { address: '0x123' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should pass if amount exceeds 500,000 (max enforced by service)', async () => {
      const dto = plainToInstance(onRampDto, {
        network: 'base',
        amount: 600000,
        destination: { address: '0x123' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass if amount is exactly 2,000', async () => {
      const dto = plainToInstance(onRampDto, {
        network: 'base',
        amount: 2000,
        destination: { address: '0x123' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass if amount is exactly 500,000', async () => {
      const dto = plainToInstance(onRampDto, {
        network: 'base',
        amount: 500000,
        destination: { address: '0x123' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass if amount is 250,000', async () => {
      const dto = plainToInstance(onRampDto, {
        network: 'base',
        amount: 250000,
        destination: { address: '0x123' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('offRampDto', () => {
    it('should fail if amount is less than 2000', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'base',
        amount: 1000,
        destination: { bankCode: '011', accountNumber: '1234567890' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should pass if amount exceeds 500,000 (max enforced by service)', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'base',
        amount: 600000,
        destination: { bankCode: '011', accountNumber: '1234567890' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass if amount is exactly 2,000', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'base',
        amount: 2000,
        destination: { bankCode: '011', accountNumber: '1234567890' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass if amount is exactly 500,000', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'base',
        amount: 500000,
        destination: { bankCode: '011', accountNumber: '1234567890' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass if amount is 250,000', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'base',
        amount: 250000,
        destination: { bankCode: '011', accountNumber: '1234567890' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept network=stellar with a valid sourceAddress', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'stellar',
        amount: 5000,
        destination: { bankCode: '058', accountNumber: '1234567890' },
        sourceAddress: VALID_STELLAR_ADDRESS,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept network=stellar without sourceAddress (service enforces it)', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'stellar',
        amount: 5000,
        destination: { bankCode: '058', accountNumber: '1234567890' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail if sourceAddress is not a Stellar public key', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'stellar',
        amount: 5000,
        destination: { bankCode: '058', accountNumber: '1234567890' },
        sourceAddress: '0x1234567890abcdef',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('matches');
    });

    it('should reject an unknown network value', async () => {
      const dto = plainToInstance(offRampDto, {
        network: 'solana',
        amount: 5000,
        destination: { bankCode: '058', accountNumber: '1234567890' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });
  });

  describe('onRampDto network enum', () => {
    it('should accept network=stellar (service returns 501)', async () => {
      const dto = plainToInstance(onRampDto, {
        network: 'stellar',
        amount: 5000,
        destination: { address: VALID_STELLAR_ADDRESS },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject an unknown network value', async () => {
      const dto = plainToInstance(onRampDto, {
        network: 'solana',
        amount: 5000,
        destination: { address: '0x123' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });
  });

  describe('ConfirmStellarOfframpDto', () => {
    it('should pass with a 64-char hex transaction hash', async () => {
      const dto = plainToInstance(ConfirmStellarOfframpDto, {
        stellarTxHash: VALID_STELLAR_TX_HASH,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with an optional matching sourceAddress', async () => {
      const dto = plainToInstance(ConfirmStellarOfframpDto, {
        stellarTxHash: VALID_STELLAR_TX_HASH,
        sourceAddress: VALID_STELLAR_ADDRESS,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without stellarTxHash', async () => {
      const dto = plainToInstance(ConfirmStellarOfframpDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail on a malformed stellarTxHash', async () => {
      const dto = plainToInstance(ConfirmStellarOfframpDto, {
        stellarTxHash: 'not-a-hash',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('matches');
    });
  });
});
