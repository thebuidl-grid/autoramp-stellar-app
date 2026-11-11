import { PartialType } from '@nestjs/swagger';
import { OnboardingCreateMerchantDto } from './create-merchant.dto';

export class UpdateMerchantDto extends PartialType(
  OnboardingCreateMerchantDto,
) {}
