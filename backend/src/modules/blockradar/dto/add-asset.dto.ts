import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AddAssetDto {
  @ApiProperty({
    example: 'ethereum',
    description: 'Blockchain network for the asset',
  })
  @IsString()
  @IsNotEmpty()
  blockchain: string;

  @ApiProperty({
    example: '0xTokenContractAddress...',
    description: 'Asset contract address',
  })
  @IsString()
  @IsNotEmpty()
  assetAddress: string;
}
