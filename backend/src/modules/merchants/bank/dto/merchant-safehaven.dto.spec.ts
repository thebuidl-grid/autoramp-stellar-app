import { validate } from 'class-validator';
import { MerchantCreateSubAccountDto } from './merchant-create-sub-account.dto';
import { MerchantCreateVirtualAccountDto } from './merchant-create-virtual-account.dto';
import { MerchantTransferDto } from './merchant-transfer.dto';
import { MerchantNameEnquiryDto } from './merchant-name-enquiry.dto';
import { MerchantInitiateVerificationDto } from './merchant-initiate-verification.dto';
import { MerchantValidateVerificationDto } from './merchant-validate-verification.dto';

describe('Merchant Bank DTOs', () => {
  describe('MerchantCreateSubAccountDto', () => {
    it('should pass with valid data', async () => {
      const dto = new MerchantCreateSubAccountDto();
      dto.phoneNumber = '08012345678';
      dto.emailAddress = 'user@example.com';
      dto.externalReference = 'ref-1';
      dto.identityType = 'BVN';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing required fields', async () => {
      const dto = new MerchantCreateSubAccountDto();

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const fields = errors.map((e) => e.property);
      expect(fields).toContain('phoneNumber');
      expect(fields).toContain('emailAddress');
      expect(fields).toContain('externalReference');
    });

    it('should fail with invalid identityType', async () => {
      const dto = new MerchantCreateSubAccountDto();
      dto.phoneNumber = '08012345678';
      dto.emailAddress = 'user@example.com';
      dto.externalReference = 'ref-1';
      (dto as any).identityType = 'INVALID';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

  });

  describe('MerchantCreateVirtualAccountDto', () => {
    it('should pass with valid data', async () => {
      const dto = new MerchantCreateVirtualAccountDto();
      dto.amount = 5000;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with zero amount', async () => {
      const dto = new MerchantCreateVirtualAccountDto();
      dto.amount = 0;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid amountControl', async () => {
      const dto = new MerchantCreateVirtualAccountDto();
      dto.amount = 5000;
      (dto as any).amountControl = 'InvalidControl';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('MerchantTransferDto', () => {
    it('should pass with valid data', async () => {
      const dto = new MerchantTransferDto();
      dto.beneficiaryBankCode = '011';
      dto.beneficiaryAccountNumber = '0123456789';
      dto.amount = 5000;
      dto.narration = 'Test';
      dto.paymentReference = 'ref-1';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing required fields', async () => {
      const dto = new MerchantTransferDto();

      const errors = await validate(dto);
      const fields = errors.map((e) => e.property);
      expect(fields).toContain('beneficiaryBankCode');
      expect(fields).toContain('beneficiaryAccountNumber');
      expect(fields).toContain('amount');
      expect(fields).toContain('narration');
      expect(fields).toContain('paymentReference');
    });
  });

  describe('MerchantNameEnquiryDto', () => {
    it('should pass with valid data', async () => {
      const dto = new MerchantNameEnquiryDto();
      dto.bankCode = '011';
      dto.accountNumber = '0123456789';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with empty fields', async () => {
      const dto = new MerchantNameEnquiryDto();

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('MerchantInitiateVerificationDto', () => {
    it('should pass with valid data', async () => {
      const dto = new MerchantInitiateVerificationDto();
      dto.type = 'BVN';
      dto.number = '22222222222';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid type', async () => {
      const dto = new MerchantInitiateVerificationDto();
      dto.type = 'INVALID' as any;
      dto.number = '22222222222';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept boolean for async field', async () => {
      const dto = new MerchantInitiateVerificationDto();
      dto.type = 'BVN';
      dto.number = '22222222222';
      dto.async = true;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('MerchantValidateVerificationDto', () => {
    it('should pass with valid data', async () => {
      const dto = new MerchantValidateVerificationDto();
      dto.identityId = 'id-123';
      dto.type = 'BVN';
      dto.otp = '123456';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid type', async () => {
      const dto = new MerchantValidateVerificationDto();
      dto.identityId = 'id-123';
      dto.type = 'NIN' as any;
      dto.otp = '123456';
      (dto as any).type = 'INVALID';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
