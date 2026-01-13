import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsEmail, IsNotEmpty } from 'class-validator';

/**
 * Create Merchant DTO
 * 
 * Used to create a new merchant user and generate their first API key.
 */
export class CreateMerchantDto {
    @ApiProperty({
        example: 'merchant@example.com',
        description: 'Email address of the merchant',
    })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({
        example: 'John Doe',
        description: 'Name of the contact person',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        example: 'Acme Corp',
        description: 'Business name',
    })
    @IsString()
    @IsNotEmpty()
    businessName: string;

    @ApiProperty({
        example: 'https://acme.com',
        description: 'Business website URL',
    })
    @IsString()
    @IsNotEmpty()
    websiteUrl: string;

    @ApiPropertyOptional({
        description: 'Expected traffic/volume for this API key',
    })
    @IsOptional()
    @IsString()
    trafficEstimate?: string;

    @ApiPropertyOptional({
        description: 'Request limit for this API key',
    })
    @IsOptional()
    @IsString()
    requestLimit?: string;
}
