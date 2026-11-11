import { PartialType } from '@nestjs/swagger';
import { CreateDirectorDto } from './create-director.dto';

export class UpdateDirectorDto extends PartialType(CreateDirectorDto) {}
