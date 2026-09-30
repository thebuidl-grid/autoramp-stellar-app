import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCorridorDto } from './create-corridor.dto';

export class UpdateCorridorDto extends PartialType(
  OmitType(CreateCorridorDto, ['countryCode', 'fiatCurrency'] as const),
) {}
