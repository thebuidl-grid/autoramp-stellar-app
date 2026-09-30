import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateBridgeTransferDto {
  @ApiProperty({ example: 'base', description: "Source chain name, as registered in the chain registry (e.g. 'base', 'ethereum', 'stellar')" })
  @IsString()
  sourceChain: string;

  @ApiPropertyOptional({
    example: 'stellar',
    default: 'stellar',
    description: "Destination chain name, as registered in the chain registry. Defaults to 'stellar' (today's only supported destination before this feature)."
  })
  @IsOptional()
  @IsString()
  destinationChain?: string;

  @ApiPropertyOptional({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    description: 'Address that should receive the minted USDC — a Stellar strkey (G/M/C...) when destinationChain is stellar, or a 0x EVM address otherwise. Optional only with payoutFiat set (nothing is ever delivered there — the mint is redirected to the distribution account regardless — so BridgeService defaults it to the distribution account\'s own address when omitted); required in every other case.',
  })
  @IsOptional()
  @IsString()
  // Coarse shape check covering both a Stellar strkey (G/M/C, 56-69 chars)
  // and a 0x-prefixed 20-byte EVM address — which one actually applies
  // depends on destinationChain and is enforced in BridgeService, not
  // here. StrKey.isValid*() in cctp-encoding.util.ts is the authoritative
  // Stellar-side validation.
  @Matches(/^([GMC][A-Z2-7]{54,68}|0x[a-fA-F0-9]{40})$/, {
    message: 'destinationAddress must be a valid Stellar G/M/C strkey or a 0x EVM address',
  })
  destinationAddress?: string;

  @ApiPropertyOptional({
    example: 100,
    description: 'Expected amount, in sourceTokenCode\'s units (USDC unless sourceTokenCode says otherwise) — for sanity-checking against the attestation once relayed, and (with sourceTokenCode set) as the amount quoted for the pre-burn swap.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  expectedAmount?: number;

  @ApiPropertyOptional({
    example: 'USDT',
    description: "Multi-stablecoin bridge-in: the token expectedAmount is denominated in, on an EVM sourceChain — 'USDT', 'DAI', etc., registered per-chain in ChainTokenRegistryService. Defaults to 'USDC' (skip the pre-burn swap, today's behavior). Requires ZEROX_API_KEY to be configured.",
  })
  @IsOptional()
  @IsString()
  sourceTokenCode?: string;

  @ApiPropertyOptional({
    example: 'CNGN',
    description: 'Swap tab only: when set, the bridged USDC is converted to this corridor stablecoin and paid out instead of left as raw USDC (destinationChain must be stellar).',
  })
  @IsOptional()
  @IsString()
  payoutStablecoinCode?: string;

  @ApiPropertyOptional({
    example: 'BRZ',
    description: "Swap tab only: when set and destinationChain is an EVM chain, the bridged USDC can be swapped into this ChainToken after the mint completes — self-custodial, via a follow-up call to POST /bridge/transfers/:reference/build-destination-swap once the transfer is COMPLETED. Mutually exclusive with payoutStablecoinCode. Validated against the destination chain's registered ChainTokens.",
  })
  @IsOptional()
  @IsString()
  payoutTokenCode?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      "Sell tab: when true, the bridged USDC is redirected to AutoRamp's own distribution account (same trick payoutStablecoinCode uses) and, once completed, paid out as fiat to payoutBankCode/payoutAccountNumber/payoutFiatCurrency instead of left as a stablecoin. Mutually exclusive with payoutStablecoinCode/payoutTokenCode. Requires destinationAddress to still be set (the burn-side wallet), but the mint itself never lands there.",
  })
  @IsOptional()
  @IsBoolean()
  payoutFiat?: boolean;

  @ApiPropertyOptional({ example: '044', description: 'Sell tab, with payoutFiat: destination bank code.' })
  @IsOptional()
  @IsString()
  payoutBankCode?: string;

  @ApiPropertyOptional({ example: '0123456789', description: 'Sell tab, with payoutFiat: destination account number.' })
  @IsOptional()
  @IsString()
  payoutAccountNumber?: string;

  @ApiPropertyOptional({ example: 'NGN', description: 'Sell tab, with payoutFiat: fiat currency to pay out (ISO 4217) — selects the corridor.' })
  @IsOptional()
  @IsString()
  payoutFiatCurrency?: string;

  @ApiPropertyOptional({
    example: 0.05,
    default: 0.05,
    description: 'Swap tab only: slippage tolerance (0-1, e.g. 0.05 = 5%) applied to the payout leg\'s quote — below this floor, the payout is held for manual review instead of paid out short. Defaults to 0.05, matching the rest of this app\'s swap paths.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  payoutSlippage?: number;

  @ApiPropertyOptional({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    description: "Required for both source chain types — the connected wallet's address. For a Stellar source it's used to build the unsigned burn XDR (account sequence lookup); for an EVM source it's not embedded in the approve/burn calldata itself (msg.sender is implicit when the wallet submits), but is required to keep the transfer's audit trail complete. Enforced in BridgeService per sourceChain, not here.",
  })
  @IsOptional()
  @IsString()
  sourceAddress?: string;
}
