import { PartialType } from '@nestjs/swagger';
import { CreateShareholderDto } from './create-shareholder.dto';

export class UpdateShareholderDto extends PartialType(CreateShareholderDto) {}
