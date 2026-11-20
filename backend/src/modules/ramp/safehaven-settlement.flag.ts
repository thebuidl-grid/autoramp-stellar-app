import { ConfigService } from '@nestjs/config';

/**
 * NGN settlement through SafeHaven is ON by default. Set SAFEHAVEN_NGN_SETTLEMENT=false to fall back to
 * Bitnob paying out / collecting directly. Only NGN user (non-merchant) orders are ever affected.
 */
export function isSafehavenNgnSettlementEnabled(
  config: ConfigService,
  countryCode: string,
  isMerchant: boolean,
): boolean {
  const flag = String(config.get('SAFEHAVEN_NGN_SETTLEMENT') ?? 'true').toLowerCase();
  return flag !== 'false' && countryCode === 'NG' && !isMerchant;
}
