import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEmail, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserBankAccountDto } from './create-bank-account.dto';

export class CompleteUserBankAccountVerificationDto {
  @ApiProperty({ description: 'OTP code sent to email' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Email address where OTP was sent' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Bank account details to create' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => CreateUserBankAccountDto)
  bankAccount: CreateUserBankAccountDto;
}
