import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class CreateChildVirtualAccountDto {
  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @IsNotEmpty()
  firstname: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @IsNotEmpty()
  lastname: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Email address',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '+2348011223344',
    description: 'Phone number',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;
}
