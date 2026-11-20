import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WAITLIST_USER_TYPES } from '../waitlist.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Blank optional text becomes undefined (stored as null). */
const trimOrUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** "+234 801-234 5678" -> "+2348012345678"; a blank value becomes undefined so it fails as missing. */
const normalizePhone = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const cleaned = value.replace(/[\s\-().]/g, '');
  return cleaned === '' ? undefined : cleaned;
};

/** "https://www.Example.com/path?x=1" or "Example.com" -> "example.com"; blank -> undefined. */
export function normalizeReferrer(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return undefined;
  let host = raw;
  try {
    host = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`,
    ).hostname;
  } catch {
    return raw.toLowerCase().slice(0, 255);
  }
  return host.toLowerCase().replace(/^www\./, '') || undefined;
}

export class JoinWaitlistDto {
  @ApiProperty({
    example: 'Ada Lovelace',
    description: 'Full name or username',
  })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'ada@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: '+2348012345678',
    description:
      'Phone number, 7-15 digits with an optional leading + (spaces, dashes and brackets are ignored)',
  })
  @Transform(normalizePhone)
  @IsNotEmpty({ message: 'phoneNumber is required' })
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'phoneNumber must be 7-15 digits, optionally starting with +',
  })
  phoneNumber: string;

  @ApiProperty({
    enum: WAITLIST_USER_TYPES,
    example: 'freelancer',
    description: 'What the person does',
  })
  @IsIn(WAITLIST_USER_TYPES)
  userType: string;

  @ApiPropertyOptional({
    example: 'NG',
    description:
      'Country chosen in the phone-number selector (ISO 3166-1 alpha-2)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  phoneCountry?: string;

  @ApiPropertyOptional({
    example: 'twitter.com',
    description: 'Hostname of the page that referred the visitor',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeReferrer(value))
  @IsString()
  @MaxLength(255)
  referrer?: string;

  @ApiPropertyOptional({ example: 'twitter' })
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(100)
  utmSource?: string;

  @ApiPropertyOptional({ example: 'social' })
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(100)
  utmMedium?: string;

  @ApiPropertyOptional({ example: 'launch' })
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(100)
  utmCampaign?: string;

  @ApiPropertyOptional({
    example: 'landing',
    description: 'Where the signup came from',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}
