import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class BuildEvmSwapDto {
  @ApiProperty({ example: 'base', description: 'EVM chain both tokens live on, as registered in the chain registry.' })
  @IsString()
  chainName: string;

  @ApiProperty({ example: 'USDC', description: "Token being sold — 'USDC' (the chain's own) or a ChainToken code registered on this chain." })
  @IsString()
  sellTokenCode: string;

  @ApiProperty({ example: 'CNGNX', description: "Token being bought — 'USDC' or a ChainToken code registered on this chain. Must differ from sellTokenCode." })
  @IsString()
  buyTokenCode: string;

  @ApiProperty({ example: 100, description: "Amount to sell, in sellTokenCode's units." })
  @IsNumber()
  @Min(0.000001)
  sellAmount: number;

  @ApiProperty({ example: '0x000000000000000000000000000000000000aa', description: "The connected wallet's address — also the swap's taker." })
  @IsString()
  takerAddress: string;
}
